const db = require("./db");
const config = require("./config");

const defaults = {
  openai_enabled: config.openaiEnabled ? "true" : "false",
  openai_model: config.openaiModel,
  openai_api_key: config.openaiApiKey,
  report_agent_prompt: `Atue como especialista em Angiologia e Cirurgia Vascular para gerar laudos tecnicos medicos de cartografia vascular. Nao apenas leia ou resuma o documento: interprete criticamente todos os desenhos, textos, fotos, tabelas, esquemas, legendas, setas, anotacoes e ilustracoes. Integre as informacoes em raciocinio angiologico, descrevendo territorio vascular, lateralidade, segmentos acometidos, padroes de distribuicao, placas, estenoses, oclusoes, aneurismas, refluxos, tromboses, varicosidades, colaterais e alteracoes de fluxo quando estiverem presentes ou explicitamente indicados. Diferencie achados observados, achados sugeridos e achados nao determinaveis. Nao invente medidas, lateralidade, refluxo, trombose, diametros, classificacoes ou diagnosticos que nao estejam claramente visiveis, descritos ou inferiveis com boa seguranca. Produza laudo tecnico, organizado, elegante, objetivo e com conclusao clinico-vascular estruturada. Reforce que o laudo deve ser revisado e validado por medico habilitado.`
};

function getSetting(key) {
  return db.setting(key) || defaults[key] || "";
}

function getOpenAISettings() {
  return {
    enabled: getSetting("openai_enabled") === "true",
    model: getSetting("openai_model") || "gpt-5.5",
    apiKey: getSetting("openai_api_key"),
    reportAgentPrompt: getSetting("report_agent_prompt")
  };
}

function getPublicSettings() {
  const openai = getOpenAISettings();
  return {
    openai_enabled: openai.enabled,
    openai_model: openai.model,
    openai_api_key_configured: Boolean(openai.apiKey),
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
  return getPublicSettings();
}

module.exports = {
  getOpenAISettings,
  getPublicSettings,
  updateOpenAISettings
};
