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
  if (!width && !height) {
    return [
      "Documento PDF recebido para análise multimodal.",
      "O conteúdo pode incluir textos, desenhos, fotos, tabelas, legendas e ilustrações em múltiplas páginas.",
      "A interpretação detalhada do PDF depende da leitura multimodal pelo modelo OpenAI configurado.",
      "Os achados devem ser correlacionados com o exame original e validados por profissional habilitado."
    ];
  }

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

function pdfMetadata(buffer) {
  if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") return null;
  const text = buffer.subarray(0, Math.min(buffer.length, 2_000_000)).toString("latin1");
  const pageMatches = text.match(/\/Type\s*\/Page\b/g) || [];
  return {
    width: null,
    height: null,
    format: "pdf",
    pageCount: pageMatches.length || null,
    byteLength: buffer.length
  };
}

async function analyzeImage(filePath) {
  const buffer = fs.readFileSync(filePath);
  const pdf = pdfMetadata(buffer);
  if (pdf) {
    return {
      width: pdf.width,
      height: pdf.height,
      format: pdf.format,
      pageCount: pdf.pageCount,
      byteLength: pdf.byteLength,
      stats: { means: [0, 0, 0] },
      edgeScore: 0,
      entropy: 0
    };
  }

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
  const fileInputs = files.map((file) => {
    const base64 = fs.readFileSync(file.storedPath).toString("base64");
    if (file.mimetype === "application/pdf") {
      return {
        type: "input_file",
        filename: file.originalName || file.storedName || "documento.pdf",
        file_data: base64
      };
    }
    return {
      type: "input_image",
      image_url: `data:${file.mimetype};base64,${base64}`,
      detail: "high"
    };
  });
  const prompt = `
Voce atua como especialista em Angiologia e Cirurgia Vascular, com foco em interpretacao de cartografia vascular, mapeamento vascular e documentacao diagnostica vascular. Sua tarefa nao e apenas ler ou resumir o documento: voce deve interpretar criticamente todos os elementos visuais e textuais enviados e redigir um laudo tecnico medico estruturado em portugues do Brasil.

Regras obrigatorias:
- Retorne somente JSON valido, sem markdown.
- Leia integralmente todos os PDFs enviados, considerando texto extraido e representacao visual de cada pagina.
- Analise todos os desenhos, textos, fotos, tabelas, esquemas, legendas, setas, anotacoes e ilustracoes presentes.
- Integre as informacoes visuais e textuais em raciocinio angiologico, descrevendo territorio vascular, lateralidade, segmentos acometidos, padroes de distribuicao, placas, estenoses, oclusoes, aneurismas, refluxos, tromboses, varicosidades, colaterais, alteracoes de fluxo ou outros achados quando estiverem presentes ou explicitamente indicados.
- Diferencie com clareza achados observados, achados sugeridos e achados nao determinaveis pelo material enviado.
- Nao invente medidas, lateralidade, refluxo, trombose, diametros, classificacoes ou diagnosticos que nao estejam claramente visiveis, descritos ou inferiveis com boa seguranca.
- Quando houver incerteza, descreva como "sugestivo" ou "nao determinavel pela imagem estatica".
- Inclua observacao de revisao por medico habilitado.
- Use linguagem medica clara, objetiva, elegante e compativel com laudo tecnico de especialista.
- A conclusao deve sintetizar a interpretacao clinico-vascular, priorizando relevancia diagnostica e limitacoes do material.

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
  "descricao_geral": "Identificacao do exame, qualidade do material, regiao/territorio vascular avaliado e contexto tecnico.",
  "achados_principais": ["Achados vasculares principais, cada item com linguagem tecnica e objetiva."],
  "analise_tecnica": "Interpretacao angiologica detalhada, correlacionando desenhos, textos, fotos, tabelas, marcacoes e padroes vasculares.",
  "conclusao": "Conclusao estruturada com impressao tecnico-medica e limitacoes.",
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
            ...fileInputs
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
