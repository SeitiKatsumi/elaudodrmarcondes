const db = require("./db");
const config = require("./config");

const defaults = {
  openai_enabled: config.openaiEnabled ? "true" : "false",
  openai_model: config.openaiModel,
  openai_api_key: config.openaiApiKey
};

function getSetting(key) {
  return db.setting(key) || defaults[key] || "";
}

function getOpenAISettings() {
  return {
    enabled: getSetting("openai_enabled") === "true",
    model: getSetting("openai_model") || "gpt-5.5",
    apiKey: getSetting("openai_api_key")
  };
}

function getPublicSettings() {
  const openai = getOpenAISettings();
  return {
    openai_enabled: openai.enabled,
    openai_model: openai.model,
    openai_api_key_configured: Boolean(openai.apiKey),
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
  return getPublicSettings();
}

module.exports = {
  getOpenAISettings,
  getPublicSettings,
  updateOpenAISettings
};
