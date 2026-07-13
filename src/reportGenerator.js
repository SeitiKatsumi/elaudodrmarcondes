const fs = require("fs");

function formatPatient(meta) {
  const parts = [];
  if (meta.patient_name) parts.push(`Paciente: ${meta.patient_name}`);
  if (meta.age) parts.push(`Idade: ${meta.age}`);
  if (meta.sex) parts.push(`Sexo: ${meta.sex}`);
  if (meta.laterality) parts.push(`Lateralidade: ${meta.laterality}`);
  if (meta.requester_name) parts.push(`Solicitante: ${meta.requester_name}`);
  return parts.length ? parts.join(" | ") : "Dados de identificação não informados.";
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
    ? "alta densidade de bordas e transições, sugerindo mapa com múltiplos segmentos vasculares ou legendas"
    : "densidade moderada de bordas, com delimitação visual relativamente organizada";
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
  if (!metadata) throw new Error("Formato de imagem não reconhecido.");

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
    ? `Observações clínicas informadas: ${meta.clinical_notes}.`
    : "Não foram informadas observações clínicas complementares.";

  const descricao = [
    `Exame analisado automaticamente: ${examType}.`,
    identification,
    clinicalNotes,
    "A imagem apresenta padroes graficos compativeis com documentacao cartografica vascular, incluindo areas codificadas por cor, trajetos lineares e regioes de destaque visual que devem ser correlacionadas com a aquisicao original do exame.",
    ...findings
  ].join(" ");

  const analise = [
    "A avaliacao automatizada identificou distribuicao espacial organizada dos sinais visuais, com contraste suficiente para descricao macroscospica dos segmentos representados.",
    "Os padrões cromáticos e a densidade de transições sugerem presença de marcações vasculares, possíveis trajetos superficiais, regiões de interesse hemodinâmico ou anotações técnicas do exame.",
    "Não é possível, por este MVP, substituir a mensuração ultrassonográfica direta, a avaliação dinâmica do fluxo, compressibilidade, refluxo ou correlação Doppler espectral.",
    "A interpretação final deve considerar lateralidade, escala, legenda, padronização do equipamento, exame físico e história clínica."
  ].join(" ");

  const conclusao = [
    `Laudo preliminar automatizado de ${examType.toLowerCase()} com descricao visual estruturada da imagem enviada.`,
    "Ha elementos graficos suficientes para documentacao tecnica, sem determinacao diagnostica definitiva isolada pela imagem estatica.",
    "Recomenda-se revisão integral por médico habilitado antes de qualquer conduta clínica ou liberação assistencial."
  ].join(" ");

  return {
    titulo: "Laudo de Cartografia Vascular",
    introducao: descricao,
    laudo_tecnico: analise,
    descricao_geral: descricao,
    achados_principais: findings,
    analise_tecnica: analise,
    conclusao,
    observacoes: "Este laudo foi gerado automaticamente a partir de imagem estática e deve ser revisado, corrigido quando necessário e validado por profissional médico habilitado."
  };
}

function extractJson(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("Resposta vazia do modelo.");
  try {
    return JSON.parse(trimmed);
  } catch (_err) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Resposta do modelo não contém JSON válido.");
    return JSON.parse(match[0]);
  }
}

function normalizeReport(report) {
  const introducao = report.introducao || report.descricao_geral || "";
  const laudoTecnico = report.laudo_tecnico || report.analise_tecnica || "";
  return {
    titulo: report.titulo || "Laudo de Cartografia Vascular",
    introducao,
    laudo_tecnico: laudoTecnico,
    descricao_geral: report.descricao_geral || introducao,
    achados_principais: Array.isArray(report.achados_principais) ? report.achados_principais : [],
    analise_tecnica: report.analise_tecnica || laudoTecnico,
    conclusao: report.conclusao || "",
    observacoes: report.observacoes || "Este laudo foi gerado automaticamente e deve ser validado por profissional médico habilitado."
  };
}

function detailGuidance(level) {
  const normalized = String(level || "detalhado").toLowerCase();
  if (normalized === "objetivo") {
    return "Nível de detalhamento: objetivo. Produza texto direto, sem floreios, mas inclua diagnóstico topográfico, lateralidade, segmentos e medidas relevantes. Laudo técnico sugerido entre 700 e 1100 caracteres quando houver achados.";
  }
  if (normalized === "equilibrado") {
    return "Nível de detalhamento: equilibrado. Produza análise completa sem excesso, com diagnóstico, topografia, lateralidade, segmentos e medidas relevantes. Laudo técnico sugerido entre 1000 e 1600 caracteres quando houver achados.";
  }
  return "Nível de detalhamento: detalhado. Produza laudo rico e clinicamente útil, com raciocínio vascular, topografia, lateralidade, segmentos, medidas, interpretação e limitações relevantes. Laudo técnico sugerido entre 1500 e 2400 caracteres quando houver achados.";
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
  const instructions = `
${openaiSettings.reportMacroPrompt || "Voce atua como especialista em Angiologia e Cirurgia Vascular, com foco em interpretacao de cartografia vascular, mapeamento vascular e documentacao diagnostica vascular."}

Diretrizes configuradas pelo Dr. Marcondes:
${openaiSettings.reportNuancePrompt || openaiSettings.reportAgentPrompt || "Sem diretrizes adicionais."}

${detailGuidance(openaiSettings.reportDetailLevel)}

Regras obrigatorias:
- Retorne somente JSON válido, sem markdown.
- Leia integralmente todos os PDFs enviados, considerando texto extraído e representação visual de cada página.
- Analise todos os desenhos, textos, fotos, tabelas, esquemas, legendas, setas, anotações e ilustrações presentes.
- Integre as informações visuais e textuais em raciocínio angiológico, descrevendo território vascular, lateralidade, segmentos acometidos, padrões de distribuição, placas, estenoses, oclusões, aneurismas, refluxos, tromboses, varicosidades, colaterais, alterações de fluxo ou outros achados quando estiverem presentes ou explicitamente indicados.
- Diferencie com clareza achados observados, achados sugeridos e achados não determináveis pelo material enviado.
- Não invente medidas, lateralidade, refluxo, trombose, diâmetros, classificações ou diagnósticos que não estejam claramente visíveis, descritos ou inferíveis com boa segurança.
- Em cartografia venosa de membros inferiores, linhas/trajetos em vermelho sobre veias safenas, tributárias ou varicosidades devem ser interpretados como refluxo/insuficiência venosa quando a legenda ou a convenção gráfica do mapa não indicar outra coisa.
- Não descreva o vermelho apenas como "marcação vermelha"; traduza para achado diagnóstico: refluxo em veia safena magna/parva, tributárias varicosas ou segmento correspondente.
- Associe medidas ao local anatômico e ao significado provável: medidas em mm junto ao trajeto venoso indicam calibre/diâmetro naquele segmento; medidas longitudinais em cm indicam extensão do segmento mapeado/refluxivo quando aplicável.
- Ao citar medidas, descreva onde elas estão: por exemplo segmento proximal da safena, coxa, joelho, perna/crural, distal, região maleolar ou tributária, conforme o desenho permitir.
- Procure lateralidade em marcações como D, E, direito, esquerdo, right, left ou pela orientação anatômica padronizada do desenho quando houver segurança. Não confunda "M" com lateralidade; em mapas de perna, "M" geralmente indica face medial.
- Se a lateralidade for informada nos metadados do exame, use essa lateralidade como dado do pedido e integre ao laudo.
- Se a lateralidade não estiver visível nem informada, não escreva "lateralidade não determinável" no laudo_tecnico; apenas omita lateralidade ou diga "face medial de membro inferior" quando isso for o achado visível.
- Em cartografia arterial cervical/carotídea com desenho frontal bilateral pareado, use a convenção anatômica frontal: estruturas no lado esquerdo da imagem correspondem ao lado direito do paciente, e estruturas no lado direito da imagem correspondem ao lado esquerdo do paciente, salvo rótulo/legenda contrária.
- Para carótidas em esquema frontal bilateral: eixo desenhado à esquerda da imagem = carótida direita do paciente; eixo desenhado à direita da imagem = carótida esquerda do paciente.
- Nesses esquemas carotídeos, se houver placa ulcerada/estenose em ACI no lado esquerdo da imagem e stent/hiperplasia no lado direito da imagem, descreva como placa ulcerada/estenose em ACI direita e stent/hiperplasia no eixo carotídeo esquerdo, salvo indicação contrária.
- Se houver indicação de úlcera, descreva como achado clínico-topográfico relacionado ao segmento distal/maleolar quando a localização for visível.
- No "laudo_tecnico", cite problemas, achados positivos, interpretação vascular, topografia, lateralidade, medidas e informações clinicamente relevantes encontrados no material.
- Não liste estruturas normais, achados ausentes, possibilidades genéricas, limitações longas ou o que não foi encontrado.
- Não use floreios, frases de efeito, explicações didáticas ou texto defensivo dentro do "laudo_tecnico".
- Se não houver achado relevante identificável, escreva apenas: "Sem achados vasculares relevantes identificáveis no material analisado."
- Quando houver incerteza, descreva como "sugestivo" ou "não determinável pela imagem estática".
- Inclua observação de revisão por médico habilitado.
- Use linguagem médica clara, objetiva, elegante e compatível com laudo técnico de especialista.
- A conclusão deve sintetizar a interpretação clínico-vascular, priorizando relevância diagnóstica e limitações do material.
`;

  const prompt = `
Analise o material enviado e gere um laudo técnico médico. Não transcreva apenas o que está escrito: use os elementos visuais e textuais como base para interpretação angiológica.

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
  "introducao": "Nome do exame, equipamento e transdutor quando disponíveis; se ausentes, informar como não especificado no material analisado.",
  "laudo_tecnico": "Análise técnica médica, rica e objetiva, com interpretação vascular dos achados positivos, topografia, lateralidade, segmentos e medidas relevantes.",
  "conclusao": "Conclusão clínico-vascular objetiva, priorizando os achados principais, sem inventar dados ausentes.",
  "observacoes": "Reforço de que o laudo deve ser revisado e validado por médico habilitado."
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
      instructions,
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
