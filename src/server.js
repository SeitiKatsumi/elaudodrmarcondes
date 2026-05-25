const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { v4: uuidv4 } = require("uuid");
const config = require("./config");
const db = require("./db");
const { analyzeImage, generateReport } = require("./reportGenerator");
const { getOpenAISettings, getPublicSettings, updateOpenAISettings } = require("./settings");
const {
  createAdminSessionValue,
  generateApiKey,
  hashApiKeyForStorage,
  previewApiKey,
  requireAdmin,
  requireApiKey,
  verifyAdminPassword
} = require("./auth");

fs.mkdirSync(config.uploadDir, { recursive: true });

const app = express();
const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Apenas imagens PNG, JPG ou JPEG sao aceitas."));
    cb(null, true);
  }
});
const imageUpload = upload.fields([
  { name: "image", maxCount: 12 },
  { name: "arquivo", maxCount: 12 }
]);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));

function now() {
  return new Date().toISOString();
}

function cleanMeta(body) {
  return {
    patient_name: body.patient_name || body.nome_paciente || "",
    age: body.age || body.idade || "",
    sex: body.sex || body.sexo || "",
    exam_type: body.exam_type || body.tipo_exame || "Cartografia Vascular",
    clinical_notes: body.clinical_notes || body.observacoes_clinicas || "",
    external_id: body.external_id || body.exam_id || body.identificador_externo || "",
    requester_name: body.requester_name || body.medico_solicitante || ""
  };
}

function persistApiCall({ integrationId, examId, route, status, error }) {
  db.insert("api_calls", {
    id: uuidv4(),
    integration_id: integrationId || null,
    exam_id: examId || null,
    route,
    status,
    error: error || null,
    created_at: now()
  });
}

async function handleLaudo(req, res, routeIntegrationId = null) {
  const examId = uuidv4();
  const meta = cleanMeta(req.body || {});
  const integrationId = routeIntegrationId || (req.integration && req.integration.id) || null;
  const uploadedFiles = [
    ...((req.files && req.files.image) || []),
    ...((req.files && req.files.arquivo) || [])
  ];

  if (!uploadedFiles.length) {
    persistApiCall({ integrationId, examId: null, route: req.path, status: "error", error: "Imagem obrigatória." });
    return res.status(400).json({ success: false, error: "Envie uma ou mais imagens no campo 'image' ou 'arquivo'." });
  }

  const storedFiles = uploadedFiles.map((file, index) => {
    const originalName = file.originalname || `imagem-${index + 1}`;
    const ext = path.extname(originalName).toLowerCase() || (file.mimetype === "image/png" ? ".png" : ".jpg");
    const storedName = `${examId}-${index + 1}${ext}`;
    const storedPath = path.join(config.uploadDir, storedName);
    fs.renameSync(file.path, storedPath);
    return { originalName, storedName, storedPath, mimetype: file.mimetype };
  });

  db.insert("exams", {
    id: examId,
    external_id: meta.external_id || null,
    integration_id: integrationId,
    filename: storedFiles.map((file) => file.storedName).join(", "),
    mimetype: storedFiles.map((file) => file.mimetype).join(", "),
    patient_name: meta.patient_name,
    age: meta.age,
    sex: meta.sex,
    exam_type: meta.exam_type,
    clinical_notes: meta.clinical_notes,
    requester_name: meta.requester_name,
    status: "processing",
    report_json: null,
    error: null,
    visual_summary: null,
    created_at: now(),
    completed_at: null
  });

  try {
    const visuals = await Promise.all(storedFiles.map((file) => analyzeImage(file.storedPath)));
    const visual = {
      ...visuals[0],
      imageCount: visuals.length,
      images: visuals.map((item, index) => ({
        index: index + 1,
        filename: storedFiles[index].storedName,
        width: item.width,
        height: item.height,
        format: item.format,
        entropy: item.entropy,
        edgeScore: item.edgeScore
      }))
    };
    const generated = await generateReport(meta, visual, {
      files: storedFiles,
      filePath: storedFiles[0].storedPath,
      mimetype: storedFiles[0].mimetype,
      openaiSettings: getOpenAISettings()
    });
    const laudo = generated.report;
    const visualSummary = JSON.stringify({
      width: visual.width,
      height: visual.height,
      format: visual.format,
      entropy: visual.entropy,
      edgeScore: visual.edgeScore,
      generationEngine: generated.engine,
      generationWarning: generated.warning,
      images: visual.images
    });

    db.update("exams", examId, {
      status: "completed",
      report_json: JSON.stringify(laudo),
      visual_summary: visualSummary,
      completed_at: now()
    });

    persistApiCall({ integrationId, examId, route: req.path, status: "completed" });

    return res.json({
      success: true,
      exam_id: meta.external_id || examId,
      internal_exam_id: examId,
      status: "completed",
      image_count: storedFiles.length,
      files: storedFiles.map((file) => file.storedName),
      generation_engine: generated.engine,
      generation_warning: generated.warning,
      laudo
    });
  } catch (error) {
    db.update("exams", examId, { status: "error", error: error.message, completed_at: now() });
    persistApiCall({ integrationId, examId, route: req.path, status: "error", error: error.message });
    return res.status(422).json({ success: false, error: `Nao foi possivel processar a imagem: ${error.message}` });
  }
}

app.post("/auth/login", (req, res) => {
  if (!verifyAdminPassword(req.body.password)) {
    return res.status(401).json({ success: false, error: "Senha administrativa invalida." });
  }
  res.cookie("admin_session", createAdminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.appUrl.startsWith("https://"),
    maxAge: 1000 * 60 * 60 * 12
  });
  return res.json({ success: true });
});

app.post("/auth/logout", (_req, res) => {
  res.clearCookie("admin_session");
  res.json({ success: true });
});

app.get("/api/admin/me", requireAdmin, (_req, res) => {
  res.json({ success: true, appUrl: config.appUrl });
});

app.get("/api/admin/dashboard", requireAdmin, (_req, res) => {
  const exams = db.list("exams");
  const integrationsRows = db.list("integrations");
  const total = exams.length;
  const completed = exams.filter((exam) => exam.status === "completed").length;
  const errors = exams.filter((exam) => exam.status === "error").length;
  const integrations = integrationsRows.length;
  const recentExams = [...exams].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const recentErrors = exams.filter((exam) => exam.status === "error").sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  res.json({ success: true, metrics: { total, completed, errors, integrations }, recentExams, recentErrors });
});

app.get("/api/admin/exams", requireAdmin, (_req, res) => {
  const exams = [...db.list("exams")].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100).map((exam) => ({
    ...exam,
    report: exam.report_json ? JSON.parse(exam.report_json) : null
  }));
  res.json({ success: true, exams });
});

app.get("/api/admin/integrations", requireAdmin, (_req, res) => {
  const calls = db.list("api_calls");
  const rows = [...db.list("integrations")]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((item) => ({
      id: item.id,
      name: item.name,
      api_key_preview: item.api_key_preview,
      active: item.active,
      created_at: item.created_at,
      updated_at: item.updated_at,
      call_count: calls.filter((call) => call.integration_id === item.id).length
    }));
  res.json({ success: true, integrations: rows, appUrl: config.appUrl });
});

app.post("/api/admin/integrations", requireAdmin, (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ success: false, error: "Nome da integracao obrigatorio." });
  const id = uuidv4();
  const apiKey = generateApiKey();
  db.insert("integrations", {
    id,
    name,
    api_key_hash: hashApiKeyForStorage(apiKey),
    api_key_preview: previewApiKey(apiKey),
    active: 1,
    created_at: now(),
    updated_at: now()
  });
  res.json({
    success: true,
    integration: {
      id,
      name,
      active: 1,
      api_key: apiKey,
      api_key_preview: previewApiKey(apiKey),
      endpoint: `${config.appUrl.replace(/\/$/, "")}/api/integrations/${id}/laudo`
    }
  });
});

app.patch("/api/admin/integrations/:id", requireAdmin, (req, res) => {
  const integration = db.list("integrations").find((item) => item.id === req.params.id);
  if (!integration) return res.status(404).json({ success: false, error: "Integracao nao encontrada." });
  const active = req.body.active === true || req.body.active === 1 || req.body.active === "1" ? 1 : 0;
  db.update("integrations", req.params.id, { active, updated_at: now() });
  res.json({ success: true });
});

app.get("/api/admin/integrations/:id/calls", requireAdmin, (req, res) => {
  const calls = db.list("api_calls").filter((call) => call.integration_id === req.params.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
  res.json({ success: true, calls });
});

app.get("/api/admin/settings", requireAdmin, (_req, res) => {
  res.json({ success: true, settings: getPublicSettings() });
});

app.put("/api/admin/settings", requireAdmin, (req, res) => {
  res.json({ success: true, settings: updateOpenAISettings(req.body || {}) });
});

app.post("/api/laudo", requireApiKey, imageUpload, (req, res) => handleLaudo(req, res));
app.post("/api/integrations/:integrationId/laudo", requireApiKey, imageUpload, (req, res) => {
  if (!req.integration || req.integration.id !== req.params.integrationId) {
    return res.status(403).json({ success: false, error: "API Key nao pertence a integracao informada." });
  }
  return handleLaudo(req, res, req.params.integrationId);
});

app.post("/api/admin/manual-laudo", requireAdmin, imageUpload, (req, res) => handleLaudo(req, res));

app.use((error, req, res, _next) => {
  if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  if (req.files) {
    Object.values(req.files).flat().forEach((file) => {
      if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    });
  }
  const message = error.message || "Erro interno.";
  persistApiCall({ route: req.path, status: "error", error: message });
  res.status(400).json({ success: false, error: message });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(config.port, () => {
  console.log(`Laudos Dr. Marcondes rodando em http://localhost:${config.port}`);
});
