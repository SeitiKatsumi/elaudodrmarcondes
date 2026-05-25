const fs = require("fs");
const path = require("path");
const config = require("./config");

const initialData = {
  integrations: [],
  exams: [],
  api_calls: [],
  app_settings: []
};

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

function readData() {
  if (!fs.existsSync(config.databasePath)) return structuredClone(initialData);
  try {
    return { ...structuredClone(initialData), ...JSON.parse(fs.readFileSync(config.databasePath, "utf8")) };
  } catch (_error) {
    return structuredClone(initialData);
  }
}

let data = readData();

function save() {
  fs.writeFileSync(config.databasePath, JSON.stringify(data, null, 2));
}

function insert(collection, row) {
  data[collection].push(row);
  save();
  return row;
}

function update(collection, id, patch) {
  const index = data[collection].findIndex((item) => item.id === id);
  if (index === -1) return null;
  data[collection][index] = { ...data[collection][index], ...patch };
  save();
  return data[collection][index];
}

function setting(key) {
  const row = data.app_settings.find((item) => item.key === key);
  return row ? row.value || "" : "";
}

function setSetting(key, value) {
  const index = data.app_settings.findIndex((item) => item.key === key);
  const row = { key, value: value == null ? "" : String(value), updated_at: new Date().toISOString() };
  if (index === -1) data.app_settings.push(row);
  else data.app_settings[index] = row;
  save();
}

function list(collection) {
  return data[collection];
}

module.exports = {
  insert,
  list,
  save,
  setting,
  setSetting,
  update
};
