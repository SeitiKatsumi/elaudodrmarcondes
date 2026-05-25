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
  { name: "image", maxCount: 1 },
  { name: "arquivo", maxCount: 1 }
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
  db.prepare(`
    INSERT INTO api_calls (id, integration_id, exam_id, route, status, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), integrationId || null, examId || null, route, status, error || null, now());
}

async function handleLaudo(req, res, routeIntegrationId = null) {
  const examId = uuidv4();
  const meta = cleanMeta(req.body || {});
  const integrationId = routeIntegrationId || (req.integration && req.integration.id) || null;
  req.file = req.file || (req.files && req.files.image && req.files.image[0]) || (req.files && req.files.arquivo && req.files.arquivo[0]);

  if (!req.file) {
    persistApiCall({ integrationId, examId: null, route: req.path, status: "error", error: "Imagem obrigatoria." });
    return res.status(400).json({ success: false, error: "Envie uma imagem no campo 'image' ou 'arquivo'." });
  }

  const originalName = req.file.originalname || "imagem";
  const ext = path.extname(originalName).toLowerCase() || (req.file.mimetype === "image/png" ? ".png" : ".jpg");
  const storedName = `${examId}${ext}`;
  const storedPath = path.join(config.uploadDir, storedName);
  fs.renameSync(req.file.path, storedPath);

  db.prepare(`
    INSERT INTO exams (
      id, external_id, integration_id, filename, mimetype, patient_name, age, sex, exam_type,
      clinical_notes, requester_name, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    examId,
    meta.external_id || null,
    integrationId,
    storedName,
    req.file.mimetype,
    meta.patient_name,
    meta.age,
    meta.sex,
    meta.exam_type,
    meta.clinical_notes,
    meta.requester_name,
    "processing",
    now()
  );

  try {
    const visual = await analyzeImage(storedPath);
    const generated = await generateReport(meta, visual, {
      filePath: storedPath,
      mimetype: req.file.mimetype,
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
      generationWarning: generated.warning
    });

    db.prepare(`
      UPDATE exams SET status = ?, report_json = ?, visual_summary = ?, completed_at = ? WHERE id = ?
    `).run("completed", JSON.stringify(laudo), visualSummary, now(), examId);

    persistApiCall({ integrationId, examId, route: req.path, status: "completed" });

    return res.json({
      success: true,
      exam_id: meta.external_id || examId,
      internal_exam_id: examId,
      status: "completed",
      generation_engine: generated.engine,
      generation_warning: generated.warning,
      laudo
    });
  } catch (error) {
    db.prepare("UPDATE exams SET status = ?, error = ?, completed_at = ? WHERE id = ?")
      .run("error", error.message, now(), examId);
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
  const total = db.prepare("SELECT COUNT(*) AS count FROM exams").get().count;
  const completed = db.prepare("SELECT COUNT(*) AS count FROM exams WHERE status = 'completed'").get().count;
  const errors = db.prepare("SELECT COUNT(*) AS count FROM exams WHERE status = 'error'").get().count;
  const integrations = db.prepare("SELECT COUNT(*) AS count FROM integrations").get().count;
  const recentExams = db.prepare("SELECT id, external_id, filename, patient_name, exam_type, status, created_at FROM exams ORDER BY created_at DESC LIMIT 8").all();
  const recentErrors = db.prepare("SELECT id, error, created_at FROM exams WHERE status = 'error' ORDER BY created_at DESC LIMIT 5").all();
  res.json({ success: true, metrics: { total, completed, errors, integrations }, recentExams, recentErrors });
});

app.get("/api/admin/exams", requireAdmin, (_req, res) => {
  const exams = db.prepare("SELECT * FROM exams ORDER BY created_at DESC LIMIT 100").all().map((exam) => ({
    ...exam,
    report: exam.report_json ? JSON.parse(exam.report_json) : null
  }));
  res.json({ success: true, exams });
});

app.get("/api/admin/integrations", requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT i.id, i.name, i.api_key_preview, i.active, i.created_at, i.updated_at,
      COUNT(c.id) AS call_count
    FROM integrations i
    LEFT JOIN api_calls c ON c.integration_id = i.id
    GROUP BY i.id
    ORDER BY i.created_at DESC
  `).all();
  res.json({ success: true, integrations: rows, appUrl: config.appUrl });
});

app.post("/api/admin/integrations", requireAdmin, (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ success: false, error: "Nome da integracao obrigatorio." });
  const id = uuidv4();
  const apiKey = generateApiKey();
  db.prepare(`
    INSERT INTO integrations (id, name, api_key_hash, api_key_preview, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(id, name, hashApiKeyForStorage(apiKey), previewApiKey(apiKey), now(), now());
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
  const integration = db.prepare("SELECT * FROM integrations WHERE id = ?").get(req.params.id);
  if (!integration) return res.status(404).json({ success: false, error: "Integracao nao encontrada." });
  const active = req.body.active === true || req.body.active === 1 || req.body.active === "1" ? 1 : 0;
  db.prepare("UPDATE integrations SET active = ?, updated_at = ? WHERE id = ?").run(active, now(), req.params.id);
  res.json({ success: true });
});

app.get("/api/admin/integrations/:id/calls", requireAdmin, (req, res) => {
  const calls = db.prepare("SELECT * FROM api_calls WHERE integration_id = ? ORDER BY created_at DESC LIMIT 100").all(req.params.id);
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
