const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("./db");
const config = require("./config");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateApiKey() {
  return `ldm_${crypto.randomBytes(32).toString("hex")}`;
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function extractBearer(req) {
  const header = req.get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return req.get("x-api-key") || "";
}

function requireAdmin(req, res, next) {
  if (req.cookies && req.cookies.admin_session) {
    const expected = hashToken(config.sessionSecret + config.adminPassword);
    if (timingSafeEqualText(req.cookies.admin_session, expected)) return next();
  }
  return res.status(401).json({ success: false, error: "Acesso administrativo nao autenticado." });
}

function requireApiKey(req, res, next) {
  const token = extractBearer(req);
  if (!token) return res.status(401).json({ success: false, error: "API Key obrigatoria." });

  const tokenHash = hashToken(token);
  if (timingSafeEqualText(tokenHash, hashToken(config.masterApiKey))) {
    req.integration = null;
    return next();
  }

  const integration = db.prepare("SELECT * FROM integrations WHERE api_key_hash = ? AND active = 1").get(tokenHash);
  if (!integration) return res.status(401).json({ success: false, error: "API Key invalida ou inativa." });

  req.integration = integration;
  return next();
}

function createAdminSessionValue() {
  return hashToken(config.sessionSecret + config.adminPassword);
}

function verifyAdminPassword(password) {
  return timingSafeEqualText(password || "", config.adminPassword);
}

function hashApiKeyForStorage(apiKey) {
  return hashToken(apiKey);
}

function previewApiKey(apiKey) {
  return `${apiKey.slice(0, 8)}...${apiKey.slice(-6)}`;
}

module.exports = {
  bcrypt,
  createAdminSessionValue,
  generateApiKey,
  hashApiKeyForStorage,
  previewApiKey,
  requireAdmin,
  requireApiKey,
  verifyAdminPassword
};
