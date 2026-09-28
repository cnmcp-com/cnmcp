CREATE TABLE stdio_probe_runs (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id),
  runner_version TEXT NOT NULL,
  container_deployment_id TEXT,
  launcher TEXT,
  package_name TEXT,
  resolved_package_version TEXT,
  status TEXT NOT NULL,
  protocol_version TEXT,
  latency_ms INTEGER,
  tool_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_detail TEXT,
  evidence_r2_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX stdio_probe_runs_server ON stdio_probe_runs(server_id, started_at DESC);
CREATE INDEX stdio_probe_runs_status ON stdio_probe_runs(status, started_at DESC);
