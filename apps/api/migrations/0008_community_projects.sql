-- Community projects schema.
-- Greenfield: directory tables are dropped. Rows are not copied.
-- Rollback: restore the D1 backup taken before this migration, or drop the
-- tables below. Dropped directory rows cannot be reconstructed from this file.
-- Manual drop order if a backup restore is unavailable:
--   oauth_states, sessions, mcp_probes, security_scans, collection_items,
--   collections, likes, reviews, ratings, project_categories, submissions,
--   projects, users, project_types, categories, app_meta

DROP TABLE IF EXISTS oauth_states;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS mcp_probes;
DROP TABLE IF EXISTS security_scans;
DROP TABLE IF EXISTS collection_items;
DROP TABLE IF EXISTS collections;
DROP TABLE IF EXISTS likes;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS project_categories;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS project_types;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS app_meta;

DROP TABLE IF EXISTS resource_identities;
DROP TABLE IF EXISTS stdio_probe_runs;
DROP TABLE IF EXISTS github_repository_state;
DROP TABLE IF EXISTS static_checks;
DROP TABLE IF EXISTS server_readmes;
DROP TABLE IF EXISTS server_configs;
DROP TABLE IF EXISTS declared_tools;
DROP TABLE IF EXISTS server_sources;
DROP TABLE IF EXISTS ingest_state;
DROP TABLE IF EXISTS change_events;
DROP TABLE IF EXISTS score_snapshots;
DROP TABLE IF EXISTS tools;
DROP TABLE IF EXISTS verifications;
DROP TABLE IF EXISTS endpoints;
DROP TABLE IF EXISTS pricing;
DROP TABLE IF EXISTS servers;
DROP TABLE IF EXISTS vendors;

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE categories (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE project_types (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enables_dynamic_probe INTEGER NOT NULL DEFAULT 0,
  keywords_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  repo_key TEXT NOT NULL UNIQUE,
  repo_url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  recommendation TEXT,
  homepage TEXT,
  stars INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  topics_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  default_branch TEXT,
  pushed_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  primary_category_slug TEXT REFERENCES categories(slug),
  primary_type_slug TEXT REFERENCES project_types(slug),
  status TEXT NOT NULL CHECK (status IN ('listed', 'taken_down')),
  takedown_reason TEXT,
  heat_score REAL NOT NULL DEFAULT 0,
  submitted_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE project_categories (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category_slug TEXT NOT NULL REFERENCES categories(slug),
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, category_slug)
);

CREATE TABLE ratings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, user_id)
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE likes (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, project_id)
);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  user_id TEXT REFERENCES users(id),
  repo_url TEXT NOT NULL,
  repo_key TEXT NOT NULL,
  recommendation TEXT,
  status TEXT NOT NULL CHECK (status IN ('received', 'duplicate', 'metadata_fetched', 'retryable', 'completed')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE security_scans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  clues_json TEXT NOT NULL DEFAULT '{}',
  static_status TEXT NOT NULL CHECK (static_status IN ('pending', 'clear', 'warn', 'risk', 'scan_failed')),
  static_evidence_json TEXT NOT NULL DEFAULT '[]',
  dynamic_status TEXT NOT NULL CHECK (dynamic_status IN ('skipped', 'pending', 'clear', 'warn', 'risk', 'scan_failed')),
  dynamic_evidence_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE mcp_probes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scan_id TEXT REFERENCES security_scans(id),
  status TEXT NOT NULL,
  protocol_version TEXT,
  latency_ms INTEGER,
  tools_json TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  return_to TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX projects_listed_created ON projects(status, created_at DESC, id);
CREATE INDEX projects_listed_heat ON projects(status, heat_score DESC, id);
CREATE INDEX projects_category ON projects(primary_category_slug);
CREATE INDEX projects_type ON projects(primary_type_slug);
CREATE INDEX project_categories_slug ON project_categories(category_slug);
CREATE INDEX security_scans_project ON security_scans(project_id, created_at DESC, id);
CREATE INDEX submissions_repo ON submissions(repo_key, created_at DESC);
CREATE INDEX submissions_status ON submissions(status, created_at);
CREATE INDEX reviews_project ON reviews(project_id, created_at DESC);
CREATE INDEX ratings_project ON ratings(project_id);
CREATE INDEX collections_user ON collections(user_id, created_at DESC);
CREATE INDEX sessions_user ON sessions(user_id);

INSERT INTO categories (slug, name, description, sort_order, keywords_json, created_at, updated_at) VALUES
('程序开发', '程序开发', '写代码、改代码、审查、工程自动化', 10, '["编程","代码审查","编译器","linter","devops","重构","sdk"]', '2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z'),
('视频创作', '视频创作', '生成、剪辑、字幕、分镜', 20, '["视频","剪辑","字幕","分镜","ffmpeg","subtitle"]', '2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z'),
('游戏开发', '游戏开发', '游戏制作、资产生成、NPC 与玩法', 30, '["游戏","npc","unity","godot","资产生成"]', '2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z'),
('图像与设计', '图像与设计', '画图、海报、界面与视觉', 40, '["画图","海报","图像生成","界面设计","comfyui","stable diffusion"]', '2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z'),
('写作与内容', '写作与内容', '文章、脚本、翻译', 50, '["写作","翻译","文案","文章生成"]', '2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z'),
('音频与音乐', '音频与音乐', '语音、音乐、播客', 60, '["语音","音乐","播客","tts"]', '2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z'),
('办公与效率', '办公与效率', '文档、表格、会议、邮件、知识整理', 70, '["会议纪要","邮件","日历","知识整理","notion"]', '2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z'),
('数据分析', '数据分析', '表格分析、指标、可视化', 80, '["数据分析","可视化","dataframe"]', '2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z'),
('研究与知识', '研究与知识', '检索、论文、知识库', 90, '["论文","知识库","检索增强","arxiv"]', '2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z'),
('教育与学习', '教育与学习', '讲解、练习、课程辅导', 100, '["课程辅导","练习题","讲解"]', '2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z'),
('营销与客服', '营销与客服', '增长文案、社媒、对话客服', 110, '["客服","社媒","营销","seo"]', '2026-10-27T00:00:00.000Z', '2026-10-27T00:00:00.000Z');

INSERT INTO project_types (slug, name, sort_order, enables_dynamic_probe, keywords_json) VALUES
('skill', 'skill', 10, 0, '["skill","skills","技能包","技能"]'),
('agent', 'agent', 20, 0, '["智能体","ai agent","智能助手"]'),
('tutorial', '教程', 30, 0, '["教程","tutorial","课程"]'),
('software', '软件', 40, 0, '["插件","plugin","命令行","桌面应用"]'),
('mcp', 'mcp', 50, 1, '["mcp","model context protocol","model-context-protocol"]');

INSERT INTO app_meta (key, value) VALUES ('taxonomy_seed', 'community-v1');
