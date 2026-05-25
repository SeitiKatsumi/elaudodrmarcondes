require("dotenv").config();

const config = {
  port: Number(process.env.PORT || 3007),
  appUrl: process.env.APP_URL || "https://laudosdrmarcondes.dna11.com.br",
  adminPassword: process.env.ADMIN_PASSWORD || "admin",
  sessionSecret: process.env.SESSION_SECRET || "dev-session-secret",
  masterApiKey: process.env.API_KEY || "dev-master-api-key",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.5",
  openaiEnabled: String(process.env.OPENAI_ENABLED || "false").toLowerCase() === "true",
  databasePath: process.env.DATABASE_PATH || "./data/laudos.sqlite",
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 12)
};

module.exports = config;
