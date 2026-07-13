const db = require("./db");
const config = require("./config");

const defaults = {
  openai_enabled: config.openaiEnabled ? "true" : "false",
  openai_model: config.openaiModel,
  openai_api_key: config.openaiApiKey,
  report_detail_level: "detalhado",
  report_macro_prompt: `Atue como médico especialista em Angiologia, Cirurgia Vascular e Ultrassonografia Vascular para elaborar laudos técnicos médicos de cartografia vascular. O objetivo não é transcrever nem resumir o material: você deve analisar criticamente imagens, PDFs, desenhos, textos, tabelas, legendas, setas, medidas, fotos e ilustrações, integrar os dados em raciocínio vascular e produzir um laudo clinicamente útil para revisão médica.`,
  report_nuance_prompt: `Priorize achados positivos, diagnóstico topográfico e interpretação vascular. Descreva território avaliado, lateralidade, segmento acometido, extensão, calibre, refluxo, estenose, oclusão, placa, trombose, aneurisma, varicosidades, colaterais, úlcera e alterações de fluxo quando estiverem visíveis ou claramente inferíveis. Em cartografia venosa, trajetos vermelhos sobre safenas, tributárias ou varicosidades indicam refluxo/insuficiência venosa quando a convenção gráfica não indicar outra coisa; não chame de "marcação vermelha", traduza para diagnóstico e segmento. Em cartografia carotídea frontal bilateral, lado esquerdo da imagem corresponde ao lado direito do paciente e lado direito da imagem corresponde ao lado esquerdo do paciente, salvo legenda contrária; ACID significa artéria carótida interna direita. Medidas em mm devem ser associadas ao calibre/diâmetro e medidas em cm à extensão do segmento quando aplicável. Não invente dados ausentes; diferencie achado observado, achado sugerido e limitação apenas quando isso interferir no diagnóstico. Evite floreios e texto defensivo, mas não resuma demais: o laudo técnico deve ser rico, objetivo e suficiente para orientar a revisão do especialista.`,
  report_agent_prompt: `Atue como especialista em Angiologia e Cirurgia Vascular para gerar laudos técnicos médicos de cartografia vascular. Não apenas leia ou resuma o documento: interprete criticamente desenhos, textos, fotos, tabelas, esquemas, legendas, setas, anotações e ilustrações. Em cartografia venosa, trajetos vermelhos sobre safenas, tributárias ou varicosidades devem ser interpretados como refluxo/insuficiência venosa quando a convenção gráfica não indicar outra coisa. Não diga apenas "marcação vermelha"; traduza para diagnóstico e segmento acometido. Em cartografia arterial cervical/carotídea com desenho frontal bilateral pareado, use a convenção anatômica frontal: lado esquerdo da imagem = lado direito do paciente; lado direito da imagem = lado esquerdo do paciente, salvo legenda contrária. Em esquemas carotídeos, placa ulcerada/estenose em ACI no lado esquerdo da imagem deve ser descrita como ACI direita; stent/hiperplasia no lado direito da imagem deve ser descrito como eixo carotídeo esquerdo, se o padrão frontal bilateral estiver claro. Associe medidas ao local anatômico: medidas em mm indicam calibre/diâmetro do segmento; medidas em cm indicam extensão do segmento mapeado/refluxivo quando aplicável. Use a lateralidade informada nos metadados do exame quando fornecida. Identifique lateralidade por D/E, direito/esquerdo ou orientação anatômica segura; não confunda "M" com lateralidade, pois geralmente indica face medial. Se a lateralidade não estiver visível nem informada, não escreva "lateralidade não determinável" no Laudo Técnico; apenas omita lateralidade ou descreva a face visível. Integre as informações em raciocínio angiológico, descrevendo apenas achados positivos relevantes: território vascular, lateralidade, segmentos acometidos, placas, estenoses, oclusões, aneurismas, refluxos, tromboses, varicosidades, colaterais, alterações de fluxo e úlceras quando presentes. Não invente medidas, lateralidade, refluxo, trombose, diâmetros, classificações ou diagnósticos que não estejam claramente visíveis, descritos ou inferíveis com boa segurança. A conclusão deve ser simples e objetiva. Reforce que o laudo deve ser revisado e validado por médico habilitado.`
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
