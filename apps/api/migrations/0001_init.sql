CREATE TABLE vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'community',
  verified INTEGER NOT NULL DEFAULT 0,
  homepage TEXT
);

CREATE TABLE servers (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  repo_url TEXT,
  package_name TEXT,
  latest_version TEXT,
  version_count INTEGER NOT NULL DEFAULT 0,
  first_published_at TEXT,
  last_published_at TEXT,
  is_official INTEGER NOT NULL DEFAULT 0,
  source_registries TEXT NOT NULL DEFAULT '[]',
  transport TEXT NOT NULL DEFAULT 'unknown',
  protocol_version TEXT,
  capabilities TEXT NOT NULL DEFAULT '[]',
  license TEXT,
  homepage TEXT,
  docs_url TEXT,
  vendor_id TEXT,
  claimed_tool_names TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'unverified',
  score INTEGER,
  grade TEXT,
  algorithm_version TEXT,
  score_reason TEXT,
  verified_at TEXT,
  next_verify_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX servers_status ON servers(status);
CREATE INDEX servers_grade ON servers(grade);
CREATE INDEX servers_next_verify ON servers(next_verify_at);

CREATE TABLE pricing (
  server_id TEXT PRIMARY KEY REFERENCES servers(id),
  model TEXT NOT NULL DEFAULT 'unknown',
  detail TEXT,
  billing_party TEXT,
  free_quota TEXT,
  source TEXT NOT NULL DEFAULT 'unverified',
  collected_at TEXT
);

CREATE TABLE endpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL REFERENCES servers(id),
  url TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'streamable-http',
  region TEXT,
  reachable_probe INTEGER,
  latency_ms INTEGER,
  last_checked_at TEXT,
  last_error TEXT
);

CREATE INDEX endpoints_server ON endpoints(server_id);

CREATE TABLE verifications (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  run_at TEXT NOT NULL,
  checker TEXT NOT NULL,
  status TEXT NOT NULL,
  score REAL NOT NULL,
  evidence_json TEXT NOT NULL,
  evidence_r2_key TEXT
);

CREATE INDEX verifications_server ON verifications(server_id, run_at);

CREATE TABLE tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  input_schema TEXT,
  poisoning_flags TEXT NOT NULL DEFAULT '[]',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(server_id, name)
);

CREATE TABLE score_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  score INTEGER,
  grade TEXT,
  algorithm_version TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  components_json TEXT NOT NULL
);

CREATE INDEX score_snapshots_server ON score_snapshots(server_id, computed_at);

CREATE TABLE change_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  diff_json TEXT NOT NULL,
  detected_at TEXT NOT NULL
);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);

CREATE TABLE ingest_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
