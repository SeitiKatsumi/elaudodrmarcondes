const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("./config");

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const sqlite = new Database(config.databasePath);
sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  api_key_preview TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  integration_id TEXT,
  filename TEXT,
  mimetype TEXT,
  patient_name TEXT,
  age TEXT,
  sex TEXT,
  exam_type TEXT,
  clinical_notes TEXT,
  requester_name TEXT,
  status TEXT NOT NULL,
  report_json TEXT,
  error TEXT,
  visual_summary TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (integration_id) REFERENCES integrations(id)
);

CREATE TABLE IF NOT EXISTS api_calls (
  id TEXT PRIMARY KEY,
  integration_id TEXT,
  exam_id TEXT,
  route TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (integration_id) REFERENCES integrations(id),
  FOREIGN KEY (exam_id) REFERENCES exams(id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);
`);

const columns = {
  integrations: ["id", "name", "api_key_hash", "api_key_preview", "active", "created_at", "updated_at"],
  exams: [
    "id",
    "external_id",
    "integration_id",
    "filename",
    "mimetype",
    "patient_name",
    "age",
    "sex",
    "exam_type",
    "clinical_notes",
    "requester_name",
    "status",
    "report_json",
    "error",
    "visual_summary",
    "created_at",
    "completed_at"
  ],
  api_calls: ["id", "integration_id", "exam_id", "route", "status", "error", "created_at"]
};

function assertCollection(collection) {
  if (!columns[collection]) throw new Error(`Colecao invalida: ${collection}`);
}

function insert(collection, row) {
  assertCollection(collection);
  const keys = columns[collection].filter((key) => Object.prototype.hasOwnProperty.call(row, key));
  const placeholders = keys.map((key) => `@${key}`).join(", ");
  sqlite.prepare(`INSERT INTO ${collection} (${keys.join(", ")}) VALUES (${placeholders})`).run(row);
  return row;
}

function list(collection) {
  assertCollection(collection);
  return sqlite.prepare(`SELECT * FROM ${collection}`).all();
}

function update(collection, id, patch) {
  assertCollection(collection);
  const keys = Object.keys(patch).filter((key) => columns[collection].includes(key));
  if (keys.length) {
    const assignments = keys.map((key) => `${key} = @${key}`).join(", ");
    sqlite.prepare(`UPDATE ${collection} SET ${assignments} WHERE id = @id`).run({ ...patch, id });
  }
  return sqlite.prepare(`SELECT * FROM ${collection} WHERE id = ?`).get(id) || null;
}

function setting(key) {
  const row = sqlite.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row ? row.value || "" : "";
}

function setSetting(key, value) {
  sqlite.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (@key, @value, @updated_at)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run({
    key,
    value: value == null ? "" : String(value),
    updated_at: new Date().toISOString()
  });
}

module.exports = {
  insert,
  list,
  setting,
  setSetting,
  update
};
