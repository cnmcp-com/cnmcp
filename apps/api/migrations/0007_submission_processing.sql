ALTER TABLE submissions ADD COLUMN resource_id TEXT REFERENCES servers(id);
ALTER TABLE submissions ADD COLUMN processing_started_at TEXT;
ALTER TABLE submissions ADD COLUMN processed_at TEXT;
ALTER TABLE submissions ADD COLUMN error_code TEXT;
ALTER TABLE submissions ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX submissions_status_submitted ON submissions(status, submitted_at);

CREATE TABLE resource_identities (
  identity_key TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id),
  created_at TEXT NOT NULL
);

CREATE INDEX resource_identities_server ON resource_identities(server_id);
