CREATE TABLE static_checks (
  server_id TEXT PRIMARY KEY REFERENCES servers(id),
  checker_version TEXT NOT NULL,
  status TEXT NOT NULL,
  dynamic_mode TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  confidence_score INTEGER NOT NULL,
  warning_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL,
  checked_at TEXT NOT NULL
);

CREATE INDEX static_checks_status ON static_checks(status);
CREATE INDEX static_checks_risk ON static_checks(risk_level);
CREATE INDEX static_checks_confidence ON static_checks(confidence_score);
