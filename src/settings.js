const db = require("./db");
const config = require("./config");

const defaults = {
  openai_enabled: config.openaiEnabled ? "true" : "false",
  openai_model: config.openaiModel,
  openai_api_key: config.openaiApiKey,
  report_agent_prompt: `Atue como especialista em Angiologia e Cirurgia Vascular para gerar laudos tecnicos medicos de cartografia vascular. Nao apenas leia ou resuma o documento: interprete criticamente desenhos, textos, fotos, tabelas, esquemas, legendas, setas, anotacoes e ilustracoes. Em cartografia venosa, trajetos vermelhos sobre safenas, tributarias ou varicosidades devem ser interpretados como refluxo/insuficiencia venosa quando a convencao grafica nao indicar outra coisa. Nao diga apenas "marcacao vermelha"; traduza para diagnostico e segmento acometido. Em cartografia arterial cervical/carotidea com desenho frontal bilateral pareado, use a convencao anatomica frontal: lado esquerdo da imagem = lado direito do paciente; lado direito da imagem = lado esquerdo do paciente, salvo legenda contraria. Em esquemas carotideos, placa ulcerada/estenose em ACI no lado esquerdo da imagem deve ser descrita como ACI direita; stent/hiperplasia no lado direito da imagem deve ser descrito como eixo carotideo esquerdo, se o padrao frontal bilateral estiver claro. Associe medidas ao local anatomico: medidas em mm indicam calibre/diametro do segmento; medidas em cm indicam extensao do segmento mapeado/refluxivo quando aplicavel. Use a lateralidade informada nos metadados do exame quando fornecida. Identifique lateralidade por D/E, direito/esquerdo ou orientacao anatomica segura; nao confunda "M" com lateralidade, pois geralmente indica face medial. Se a lateralidade nao estiver visivel nem informada, nao escreva "lateralidade nao determinavel" no Laudo Tecnico; apenas omita lateralidade ou descreva a face visivel. Integre as informacoes em raciocinio angiologico, descrevendo apenas achados positivos relevantes: territorio vascular, lateralidade, segmentos acometidos, placas, estenoses, oclusoes, aneurismas, refluxos, tromboses, varicosidades, colaterais, alteracoes de fluxo e ulceras quando presentes. Nao invente medidas, lateralidade, refluxo, trombose, diametros, classificacoes ou diagnosticos que nao estejam claramente visiveis, descritos ou inferiveis com boa seguranca. O Laudo Tecnico deve ser direto, sem floreios, com no maximo 512 caracteres, citando somente problemas encontrados e informacoes clinicamente relevantes. Nao liste o que nao foi encontrado, estruturas normais ou possibilidades genericas. Se nao houver achado relevante, escreva apenas: "Sem achados vasculares relevantes identificaveis no material analisado." A conclusao deve ser simples e objetiva. Reforce que o laudo deve ser revisado e validado por medico habilitado.`
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
