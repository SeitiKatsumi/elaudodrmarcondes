const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("./config");

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
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

module.exports = db;
