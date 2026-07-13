const db = require("./db");
const config = require("./config");

const defaults = {
  openai_enabled: config.openaiEnabled ? "true" : "false",
  openai_model: config.openaiModel,
  openai_api_key: config.openaiApiKey,
  report_detail_level: "detalhado",
  report_macro_prompt: `Atue como medico especialista em Angiologia, Cirurgia Vascular e Ultrassonografia Vascular para elaborar laudos tecnicos medicos de cartografia vascular. O objetivo nao e transcrever nem resumir o material: voce deve analisar criticamente imagens, PDFs, desenhos, textos, tabelas, legendas, setas, medidas, fotos e ilustracoes, integrar os dados em raciocinio vascular e produzir um laudo clinicamente util para revisao medica.`,
  report_nuance_prompt: `Priorize achados positivos, diagnostico topografico e interpretacao vascular. Descreva territorio avaliado, lateralidade, segmento acometido, extensao, calibre, refluxo, estenose, oclusao, placa, trombose, aneurisma, varicosidades, colaterais, ulcera e alteracoes de fluxo quando estiverem visiveis ou claramente inferiveis. Em cartografia venosa, trajetos vermelhos sobre safenas, tributarias ou varicosidades indicam refluxo/insuficiencia venosa quando a convencao grafica nao indicar outra coisa; nao chame de "marcacao vermelha", traduza para diagnostico e segmento. Em cartografia carotidea frontal bilateral, lado esquerdo da imagem corresponde ao lado direito do paciente e lado direito da imagem corresponde ao lado esquerdo do paciente, salvo legenda contraria; ACID significa arteria carotida interna direita. Medidas em mm devem ser associadas ao calibre/diametro e medidas em cm a extensao do segmento quando aplicavel. Nao invente dados ausentes; diferencie achado observado, achado sugerido e limitacao apenas quando isso interferir no diagnostico. Evite floreios e texto defensivo, mas nao resuma demais: o laudo tecnico deve ser rico, objetivo e suficiente para orientar a revisao do especialista.`,
  report_agent_prompt: `Atue como especialista em Angiologia e Cirurgia Vascular para gerar laudos tecnicos medicos de cartografia vascular. Nao apenas leia ou resuma o documento: interprete criticamente desenhos, textos, fotos, tabelas, esquemas, legendas, setas, anotacoes e ilustracoes. Em cartografia venosa, trajetos vermelhos sobre safenas, tributarias ou varicosidades devem ser interpretados como refluxo/insuficiencia venosa quando a convencao grafica nao indicar outra coisa. Nao diga apenas "marcacao vermelha"; traduza para diagnostico e segmento acometido. Em cartografia arterial cervical/carotidea com desenho frontal bilateral pareado, use a convencao anatomica frontal: lado esquerdo da imagem = lado direito do paciente; lado direito da imagem = lado esquerdo do paciente, salvo legenda contraria. Em esquemas carotideos, placa ulcerada/estenose em ACI no lado esquerdo da imagem deve ser descrita como ACI direita; stent/hiperplasia no lado direito da imagem deve ser descrito como eixo carotideo esquerdo, se o padrao frontal bilateral estiver claro. Associe medidas ao local anatomico: medidas em mm indicam calibre/diametro do segmento; medidas em cm indicam extensao do segmento mapeado/refluxivo quando aplicavel. Use a lateralidade informada nos metadados do exame quando fornecida. Identifique lateralidade por D/E, direito/esquerdo ou orientacao anatomica segura; nao confunda "M" com lateralidade, pois geralmente indica face medial. Se a lateralidade nao estiver visivel nem informada, nao escreva "lateralidade nao determinavel" no Laudo Tecnico; apenas omita lateralidade ou descreva a face visivel. Integre as informacoes em raciocinio angiologico, descrevendo apenas achados positivos relevantes: territorio vascular, lateralidade, segmentos acometidos, placas, estenoses, oclusoes, aneurismas, refluxos, tromboses, varicosidades, colaterais, alteracoes de fluxo e ulceras quando presentes. Nao invente medidas, lateralidade, refluxo, trombose, diametros, classificacoes ou diagnosticos que nao estejam claramente visiveis, descritos ou inferiveis com boa seguranca. A conclusao deve ser simples e objetiva. Reforce que o laudo deve ser revisado e validado por medico habilitado.`
};

function getSetting(key) {
  return db.setting(key) || defaults[key] || "";
}

function getOpenAISettings() {
  return {
    enabled: getSetting("openai_enabled") === "true",
    model: getSetting("openai_model") || "gpt-5.5",
    apiKey: getSetting("openai_api_key"),
    reportDetailLevel: getSetting("report_detail_level") || defaults.report_detail_level,
    reportMacroPrompt: getSetting("report_macro_prompt") || defaults.report_macro_prompt,
    reportNuancePrompt: getSetting("report_nuance_prompt") || getSetting("report_agent_prompt") || defaults.report_nuance_prompt,
    reportAgentPrompt: getSetting("report_agent_prompt")
  };
}

function getPublicSettings() {
  const openai = getOpenAISettings();
  return {
    openai_enabled: openai.enabled,
    openai_model: openai.model,
    openai_api_key_configured: Boolean(openai.apiKey),
    report_detail_level: openai.reportDetailLevel,
    report_macro_prompt: openai.reportMacroPrompt,
    report_nuance_prompt: openai.reportNuancePrompt,
    report_agent_prompt: getSetting("report_agent_prompt"),
    available_models: [
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-5.1",
      "gpt-5",
      "gpt-5-mini",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini"
    ]
  };
}

function updateOpenAISettings(input) {
  if (typeof input.openai_enabled !== "undefined") {
    db.setSetting("openai_enabled", input.openai_enabled ? "true" : "false");
  }
  if (input.openai_model) db.setSetting("openai_model", input.openai_model.trim());
  if (typeof input.openai_api_key === "string" && input.openai_api_key.trim()) {
    db.setSetting("openai_api_key", input.openai_api_key.trim());
  }
  if (input.clear_openai_api_key) db.setSetting("openai_api_key", "");
  if (typeof input.report_agent_prompt === "string") {
    db.setSetting("report_agent_prompt", input.report_agent_prompt.trim() || defaults.report_agent_prompt);
  }
  if (typeof input.report_detail_level === "string") {
    db.setSetting("report_detail_level", input.report_detail_level.trim() || defaults.report_detail_level);
  }
  if (typeof input.report_macro_prompt === "string") {
    db.setSetting("report_macro_prompt", input.report_macro_prompt.trim() || defaults.report_macro_prompt);
  }
  if (typeof input.report_nuance_prompt === "string") {
    db.setSetting("report_nuance_prompt", input.report_nuance_prompt.trim() || defaults.report_nuance_prompt);
  }
  return getPublicSettings();
}

module.exports = {
  getOpenAISettings,
  getPublicSettings,
  updateOpenAISettings
};
