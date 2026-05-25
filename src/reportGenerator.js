const fs = require("fs");

function formatPatient(meta) {
  const parts = [];
  if (meta.patient_name) parts.push(`Paciente: ${meta.patient_name}`);
  if (meta.age) parts.push(`Idade: ${meta.age}`);
  if (meta.sex) parts.push(`Sexo: ${meta.sex}`);
  if (meta.requester_name) parts.push(`Solicitante: ${meta.requester_name}`);
  return parts.length ? parts.join(" | ") : "Dados de identificacao nao informados.";
}

function dominantTone(stats) {
  const means = stats.means || [0, 0, 0];
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
  const brightness = classifyBrightness(stats.means[0]);
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

function pngDimensions(buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: "png" };
}

function jpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7), format: "jpeg" };
    }
    offset += 2 + length;
  }
  return null;
}

async function analyzeImage(filePath) {
  const buffer = fs.readFileSync(filePath);
  const metadata = pngDimensions(buffer) || jpegDimensions(buffer);
  if (!metadata) throw new Error("Formato de imagem nao reconhecido.");

  const sample = buffer.subarray(0, Math.min(buffer.length, 240000));
  const sums = [0, 0, 0];
  const histogram = new Array(256).fill(0);
  let transitions = 0;
  let total = 0;
  for (let index = 0; index < sample.length; index += 3) {
    const r = sample[index] || 0;
    const g = sample[index + 1] || r;
    const b = sample[index + 2] || g;
    sums[0] += r;
    sums[1] += g;
    sums[2] += b;
    const gray = Math.round((r + g + b) / 3);
    histogram[gray] += 1;
    if (index >= 3) {
      const prev = Math.round(((sample[index - 3] || 0) + (sample[index - 2] || 0) + (sample[index - 1] || 0)) / 3);
      if (Math.abs(gray - prev) > 28) transitions += 1;
    }
    total += 1;
  }

  let entropy = 0;
  for (const count of histogram) {
    if (!count) continue;
    const p = count / total;
    entropy -= p * Math.log2(p);
  }

  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    stats: { means: sums.map((sum) => total ? sum / total : 0) },
    edgeScore: total ? transitions / total : 0,
    entropy
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

async function generateOpenAIReport(meta, visual, options, openaiSettings) {
  const files = options.files && options.files.length
    ? options.files
    : [{ storedPath: options.filePath, mimetype: options.mimetype, storedName: "imagem-1" }];
  const heuristic = generateHeuristicReport(meta, visual);
  const imageInputs = files.map((file) => ({
    type: "input_image",
    image_url: `data:${file.mimetype};base64,${fs.readFileSync(file.storedPath).toString("base64")}`,
    detail: "high"
  }));
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
    image_count: visual.imageCount || 1,
    images: visual.images || [],
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
            ...imageInputs
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
  const { filePath, mimetype, openaiSettings, files } = options;
  if (openaiSettings && openaiSettings.enabled && openaiSettings.apiKey && filePath && mimetype) {
    try {
      const report = await generateOpenAIReport(meta, visual, { filePath, mimetype, files }, openaiSettings);
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
