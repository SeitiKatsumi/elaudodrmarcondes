const fs = require("fs");
const sharp = require("sharp");

function formatPatient(meta) {
  const parts = [];
  if (meta.patient_name) parts.push(`Paciente: ${meta.patient_name}`);
  if (meta.age) parts.push(`Idade: ${meta.age}`);
  if (meta.sex) parts.push(`Sexo: ${meta.sex}`);
  if (meta.requester_name) parts.push(`Solicitante: ${meta.requester_name}`);
  return parts.length ? parts.join(" | ") : "Dados de identificacao nao informados.";
}

function dominantTone(stats) {
  const channels = stats.channels || [];
  const means = channels.slice(0, 3).map((channel) => channel.mean || 0);
  const [r, g, b] = means;
  if (b > r + 12 && b > g + 4) return "predominio de tons frios azulados/cianoticos";
  if (g > r && g > b) return "predominio de codificacao esverdeada";
  if (r > g + 12 && r > b + 12) return "predominio de tons quentes";
  return "distribuicao cromatica mista";
}

function classifyBrightness(mean) {
  if (mean < 70) return "baixo brilho global, com fundo escuro e estruturas destacadas por contraste";
  if (mean > 175) return "alto brilho global, sugerindo ampla area de sinalizacao clara";
  return "brilho global intermediario, adequado para avaliacao visual do mapa";
}

function buildFindings({ width, height, stats, edgeScore, entropy }) {
  const tone = dominantTone(stats);
  const brightness = classifyBrightness(stats.channels[0].mean);
  const detail = edgeScore > 0.14
    ? "alta densidade de bordas e transicoes, sugerindo mapa com multiplos segmentos vasculares ou legendas"
    : "densidade moderada de bordas, com delimitacao visual relativamente organizada";
  const texture = entropy > 6.2
    ? "heterogeneidade visual elevada, com variacao importante de cores e texturas"
    : "heterogeneidade visual moderada, sem dispersao extrema dos padroes cromaticos";

  return [
    `Imagem recebida em resolucao ${width} x ${height} pixels.`,
    `Observa-se ${tone} e ${brightness}.`,
    `Ha ${detail}.`,
    `O padrao geral demonstra ${texture}.`
  ];
}

async function analyzeImage(filePath) {
  const image = sharp(filePath, { failOn: "error" });
  const metadata = await image.metadata();
  const stats = await image.stats();
  const gray = await image.clone().resize({ width: 320, withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true });

  let transitions = 0;
  let total = 0;
  const { data, info } = gray;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 1; x < info.width; x += 1) {
      const diff = Math.abs(data[y * info.width + x] - data[y * info.width + x - 1]);
      if (diff > 28) transitions += 1;
      total += 1;
    }
  }

  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    stats,
    edgeScore: total ? transitions / total : 0,
    entropy: stats.entropy || 0
  };
}

function generateHeuristicReport(meta, visual) {
  const examType = meta.exam_type || "Cartografia Vascular";
  const findings = buildFindings(visual);
  const identification = formatPatient(meta);
  const clinicalNotes = meta.clinical_notes
    ? `Observacoes clinicas informadas: ${meta.clinical_notes}.`
    : "Nao foram informadas observacoes clinicas complementares.";

  const descricao = [
    `Exame analisado automaticamente: ${examType}.`,
    identification,
    clinicalNotes,
    "A imagem apresenta padroes graficos compativeis com documentacao cartografica vascular, incluindo areas codificadas por cor, trajetos lineares e regioes de destaque visual que devem ser correlacionadas com a aquisicao original do exame.",
    ...findings
  ].join(" ");

  const analise = [
    "A avaliacao automatizada identificou distribuicao espacial organizada dos sinais visuais, com contraste suficiente para descricao macroscospica dos segmentos representados.",
    "Os padroes cromaticos e a densidade de transicoes sugerem presenca de marcacoes vasculares, possiveis trajetos superficiais, regioes de interesse hemodinamico ou anotacoes tecnicas do exame.",
    "Nao e possivel, por este MVP, substituir a mensuracao ultrassonografica direta, a avaliacao dinamica do fluxo, compressibilidade, refluxo ou correlacao doppler espectral.",
    "A interpretacao final deve considerar lateralidade, escala, legenda, padronizacao do equipamento, exame fisico e historia clinica."
  ].join(" ");

  const conclusao = [
    `Laudo preliminar automatizado de ${examType.toLowerCase()} com descricao visual estruturada da imagem enviada.`,
    "Ha elementos graficos suficientes para documentacao tecnica, sem determinacao diagnostica definitiva isolada pela imagem estatica.",
    "Recomenda-se revisao integral por medico habilitado antes de qualquer conduta clinica ou liberacao assistencial."
  ].join(" ");

  return {
    titulo: "Laudo de Cartografia Vascular",
    descricao_geral: descricao,
    achados_principais: findings,
    analise_tecnica: analise,
    conclusao,
    observacoes: "Este laudo foi gerado automaticamente a partir de imagem estatica e deve ser revisado, corrigido quando necessario e validado por profissional medico habilitado."
  };
}

function extractJson(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("Resposta vazia do modelo.");
  try {
    return JSON.parse(trimmed);
  } catch (_err) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Resposta do modelo nao contem JSON valido.");
    return JSON.parse(match[0]);
  }
}

function normalizeReport(report) {
  return {
    titulo: report.titulo || "Laudo de Cartografia Vascular",
    descricao_geral: report.descricao_geral || "",
    achados_principais: Array.isArray(report.achados_principais) ? report.achados_principais : [],
    analise_tecnica: report.analise_tecnica || "",
    conclusao: report.conclusao || "",
    observacoes: report.observacoes || "Este laudo foi gerado automaticamente e deve ser validado por profissional medico habilitado."
  };
}

async function generateOpenAIReport(meta, visual, filePath, mimetype, openaiSettings) {
  const imageBase64 = fs.readFileSync(filePath).toString("base64");
  const heuristic = generateHeuristicReport(meta, visual);
  const prompt = `
Voce e um assistente de redacao medica para cartografia vascular. Analise a imagem estatica enviada e gere um laudo tecnico em portugues do Brasil.

Regras obrigatorias:
- Retorne somente JSON valido, sem markdown.
- Nao invente medidas, lateralidade, refluxo, trombose, diametros ou diagnosticos que nao estejam claramente visiveis.
- Quando houver incerteza, descreva como "sugestivo" ou "nao determinavel pela imagem estatica".
- Inclua observacao de revisao por medico habilitado.
- Use linguagem medica clara, objetiva e elegante.

Dados do exame:
${JSON.stringify(meta, null, 2)}

Resumo visual computacional:
${JSON.stringify({
    width: visual.width,
    height: visual.height,
    format: visual.format,
    entropy: visual.entropy,
    edgeScore: visual.edgeScore,
    fallback_report: heuristic
  }, null, 2)}

Formato esperado:
{
  "titulo": "Laudo de Cartografia Vascular",
  "descricao_geral": "...",
  "achados_principais": ["...", "..."],
  "analise_tecnica": "...",
  "conclusao": "...",
  "observacoes": "..."
}
`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiSettings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: openaiSettings.model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            {
              type: "input_image",
              image_url: `data:${mimetype};base64,${imageBase64}`,
              detail: "high"
            }
          ]
        }
      ]
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload.error && payload.error.message ? payload.error.message : "Falha na API da OpenAI.";
    throw new Error(message);
  }

  const text = payload.output_text || (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("\n");

  return normalizeReport(extractJson(text));
}

async function generateReport(meta, visual, options = {}) {
  const { filePath, mimetype, openaiSettings } = options;
  if (openaiSettings && openaiSettings.enabled && openaiSettings.apiKey && filePath && mimetype) {
    try {
      const report = await generateOpenAIReport(meta, visual, filePath, mimetype, openaiSettings);
      report.observacoes = `${report.observacoes} Gerado com apoio de modelo OpenAI (${openaiSettings.model}).`;
      return { report, engine: `openai:${openaiSettings.model}`, warning: null };
    } catch (error) {
      const fallback = generateHeuristicReport(meta, visual);
      fallback.observacoes = `${fallback.observacoes} A chamada ao modelo OpenAI falhou e foi usado o gerador heuristico local. Motivo: ${error.message}`;
      return { report: fallback, engine: "heuristic-fallback", warning: error.message };
    }
  }

  return { report: generateHeuristicReport(meta, visual), engine: "heuristic", warning: null };
}

module.exports = {
  analyzeImage,
  generateReport,
  generateHeuristicReport
};
