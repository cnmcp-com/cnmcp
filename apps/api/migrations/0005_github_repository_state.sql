CREATE TABLE github_repository_state (
  repo_key TEXT PRIMARY KEY,
  repo_url TEXT NOT NULL,
  etag TEXT,
  pushed_at TEXT,
  updated_at TEXT,
  default_branch TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT NOT NULL,
  last_error TEXT
);

CREATE INDEX github_repository_state_checked ON github_repository_state(last_checked_at);
