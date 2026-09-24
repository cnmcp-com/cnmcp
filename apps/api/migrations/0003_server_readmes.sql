CREATE TABLE server_readmes (
  server_id TEXT PRIMARY KEY REFERENCES servers(id),
  body TEXT NOT NULL,
  collected_at TEXT
);
