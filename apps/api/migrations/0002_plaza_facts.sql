CREATE TABLE server_sources (
  server_id TEXT PRIMARY KEY REFERENCES servers(id),
  author TEXT,
  icon_url TEXT,
  src_url TEXT,
  src_site TEXT,
  plaza_url TEXT,
  categories_json TEXT NOT NULL DEFAULT '[]',
  plaza_categories_json TEXT NOT NULL DEFAULT '[]',
  collected_at TEXT
);

CREATE TABLE declared_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL REFERENCES servers(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  input_schema TEXT,
  parameters_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(server_id, name)
);

CREATE INDEX declared_tools_server ON declared_tools(server_id);

CREATE TABLE server_configs (
  server_id TEXT PRIMARY KEY REFERENCES servers(id),
  config_json TEXT NOT NULL,
  source TEXT NOT NULL,
  collected_at TEXT
);
