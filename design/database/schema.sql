-- CNMCP member-only baseline v2.1: D1 / SQLite. Apply to a NEW EMPTY database.
-- No legacy compatibility, topic kinds, verification tiers or quality scores.
-- Application IDs are UUID/ULID text; times are UTC Unix seconds.
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  handle TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(handle)) BETWEEN 1 AND 40),
  display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 80),
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '' CHECK(length(bio)<=200),
  theme_preference TEXT NOT NULL DEFAULT 'light' CHECK(theme_preference IN ('light','dark')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','blocked','deleted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE user_identities (
  provider TEXT NOT NULL COLLATE NOCASE CHECK(length(trim(provider))>0 AND provider=trim(provider)),
  provider_subject TEXT NOT NULL CHECK(length(trim(provider_subject))>0),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(provider,provider_subject)
);
CREATE INDEX user_identities_by_user ON user_identities(user_id);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(expires_at > created_at)
);
CREATE INDEX sessions_by_user ON sessions(user_id,expires_at);

-- Domains describe subject areas; nodes are one flat, reusable taxonomy.
CREATE TABLE domains (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 40),
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE nodes (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 40),
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE domain_nodes (
  domain_id TEXT NOT NULL REFERENCES domains(id),
  node_id TEXT NOT NULL REFERENCES nodes(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(domain_id,node_id)
);
CREATE INDEX domain_nodes_by_node ON domain_nodes(node_id,domain_id);

CREATE TABLE topics (
  id TEXT PRIMARY KEY NOT NULL,
  domain_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 4 AND 100),
  body TEXT NOT NULL DEFAULT '' CHECK(length(body)<=12000),
  progress_note TEXT NOT NULL DEFAULT '' CHECK(length(progress_note)<=4000),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  last_write_key TEXT, -- server-generated edit nonce; not a user role or public field
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK(visibility IN ('visible','hidden','deleted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_activity_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(domain_id,node_id) REFERENCES domain_nodes(domain_id,node_id)
);
CREATE INDEX topics_by_domain ON topics(domain_id,visibility,last_activity_at DESC,id DESC);
CREATE INDEX topics_by_domain_node ON topics(domain_id,node_id,visibility,last_activity_at DESC,id DESC);
CREATE INDEX topics_by_node ON topics(node_id,visibility,last_activity_at DESC,id DESC);
CREATE INDEX topics_by_author ON topics(author_id,created_at DESC);
CREATE INDEX topics_feed ON topics(visibility,last_activity_at DESC,id DESC);
CREATE TABLE topic_replies (
  id TEXT PRIMARY KEY NOT NULL,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  quote_reply_id TEXT,
  body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK(visibility IN ('visible','hidden','deleted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(topic_id,id),
  FOREIGN KEY(topic_id,quote_reply_id) REFERENCES topic_replies(topic_id,id),
  CHECK(quote_reply_id IS NULL OR quote_reply_id<>id)
);
CREATE INDEX replies_by_topic ON topic_replies(topic_id,visibility,created_at,id);
CREATE INDEX replies_by_day ON topic_replies(visibility,created_at,topic_id);
CREATE INDEX replies_by_author ON topic_replies(author_id,created_at DESC);

CREATE TABLE resources (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 150),
  summary TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'link' CHECK(kind IN ('link','model','skill','tool','library')),
  created_by TEXT REFERENCES users(id),
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK(visibility IN ('visible','hidden','deleted')),
  code_license TEXT,
  weights_license TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX resources_by_kind ON resources(kind,visibility,created_at DESC,id DESC);
CREATE INDEX resources_by_author ON resources(created_by,created_at DESC);
CREATE TABLE resource_sources (
  id TEXT PRIMARY KEY NOT NULL,
  resource_id TEXT NOT NULL REFERENCES resources(id),
  provider TEXT NOT NULL CHECK(provider IN ('github','huggingface','web','community')),
  canonical_key TEXT NOT NULL UNIQUE,
  canonical_url TEXT NOT NULL CHECK(canonical_url LIKE 'https://%'),
  external_id TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  metadata_updated_at INTEGER,
  stars INTEGER CHECK(stars IS NULL OR (typeof(stars)='integer' AND stars>=0)),
  stars_observed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK((stars IS NULL AND stars_observed_at IS NULL) OR
        (provider='github' AND stars IS NOT NULL AND typeof(stars_observed_at)='integer' AND stars_observed_at>=0))
);
CREATE UNIQUE INDEX source_external_id ON resource_sources(provider,external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX source_primary ON resource_sources(resource_id) WHERE is_primary=1;
CREATE INDEX sources_by_resource ON resource_sources(resource_id);
CREATE INDEX source_github_stats_order ON resource_sources(resource_id,is_primary DESC,created_at,id) WHERE provider='github';
CREATE TABLE resource_comments (
  id TEXT PRIMARY KEY NOT NULL,
  resource_id TEXT NOT NULL REFERENCES resources(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  quote_comment_id TEXT,
  referenced_topic_id TEXT REFERENCES topics(id),
  body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK(visibility IN ('visible','hidden','deleted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(resource_id,id),
  FOREIGN KEY(resource_id,quote_comment_id) REFERENCES resource_comments(resource_id,id),
  CHECK(quote_comment_id IS NULL OR quote_comment_id<>id)
);
CREATE INDEX comments_by_resource ON resource_comments(resource_id,visibility,created_at,id);
CREATE INDEX comments_by_author ON resource_comments(author_id,created_at DESC);

-- One source object, one target resource. Repeated inline occurrences share one edge.
CREATE TABLE resource_references (
  id TEXT PRIMARY KEY NOT NULL,
  resource_id TEXT NOT NULL REFERENCES resources(id),
  topic_id TEXT REFERENCES topics(id),
  topic_reply_id TEXT REFERENCES topic_replies(id),
  resource_comment_id TEXT REFERENCES resource_comments(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK((topic_id IS NOT NULL)+(topic_reply_id IS NOT NULL)+(resource_comment_id IS NOT NULL)=1)
);
CREATE UNIQUE INDEX reference_topic ON resource_references(topic_id,resource_id) WHERE topic_id IS NOT NULL;
CREATE UNIQUE INDEX reference_reply ON resource_references(topic_reply_id,resource_id) WHERE topic_reply_id IS NOT NULL;
CREATE UNIQUE INDEX reference_comment ON resource_references(resource_comment_id,resource_id) WHERE resource_comment_id IS NOT NULL;
CREATE INDEX references_by_resource ON resource_references(resource_id);
-- Resource identity and comments are global; discoverability is domain-scoped.
CREATE TABLE resource_domains (
  resource_id TEXT NOT NULL REFERENCES resources(id),
  domain_id TEXT NOT NULL REFERENCES domains(id),
  PRIMARY KEY(resource_id,domain_id)
);
CREATE INDEX resource_domains_by_domain ON resource_domains(domain_id,resource_id);
CREATE TABLE tags (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 40),
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE domain_tags (
  domain_id TEXT NOT NULL REFERENCES domains(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(domain_id,tag_id)
);
CREATE INDEX domain_tags_by_tag ON domain_tags(tag_id,domain_id);
CREATE TABLE resource_tags (
  resource_id TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY(resource_id,domain_id,tag_id),
  FOREIGN KEY(resource_id,domain_id) REFERENCES resource_domains(resource_id,domain_id),
  FOREIGN KEY(domain_id,tag_id) REFERENCES domain_tags(domain_id,tag_id)
);
CREATE INDEX resource_tags_by_tag ON resource_tags(tag_id,domain_id,resource_id);

CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  topic_id TEXT REFERENCES topics(id),
  resource_id TEXT REFERENCES resources(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK((topic_id IS NOT NULL)+(resource_id IS NOT NULL)=1)
);
CREATE UNIQUE INDEX bookmark_topic ON bookmarks(user_id,topic_id) WHERE topic_id IS NOT NULL;
CREATE UNIQUE INDEX bookmark_resource ON bookmarks(user_id,resource_id) WHERE resource_id IS NOT NULL;
CREATE INDEX bookmarks_for_resource ON bookmarks(resource_id,user_id);
CREATE TABLE helpful_votes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  topic_reply_id TEXT REFERENCES topic_replies(id),
  resource_comment_id TEXT REFERENCES resource_comments(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK((topic_reply_id IS NOT NULL)+(resource_comment_id IS NOT NULL)=1)
);
CREATE UNIQUE INDEX helpful_reply ON helpful_votes(user_id,topic_reply_id) WHERE topic_reply_id IS NOT NULL;
CREATE UNIQUE INDEX helpful_comment ON helpful_votes(user_id,resource_comment_id) WHERE resource_comment_id IS NOT NULL;
CREATE INDEX helpful_for_comment ON helpful_votes(resource_comment_id,user_id);
CREATE TABLE drafts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  domain_id TEXT REFERENCES domains(id),
  node_id TEXT,
  editing_topic_id TEXT REFERENCES topics(id),
  title TEXT NOT NULL DEFAULT '' CHECK(length(title)<=100),
  body TEXT NOT NULL DEFAULT '' CHECK(length(body)<=12000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(node_id IS NULL OR domain_id IS NOT NULL),
  FOREIGN KEY(domain_id,node_id) REFERENCES domain_nodes(domain_id,node_id)
);
CREATE INDEX drafts_by_user ON drafts(user_id,updated_at DESC);

-- Match reply events in the interval (start_event_id, end_event_id].
CREATE TABLE topic_follows (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  topic_id TEXT NOT NULL REFERENCES topics(id),
  start_event_id INTEGER NOT NULL CHECK(typeof(start_event_id)='integer' AND start_event_id>=0),
  end_event_id INTEGER CHECK(end_event_id IS NULL OR (typeof(end_event_id)='integer' AND end_event_id>=start_event_id)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX topic_follow_open ON topic_follows(user_id,topic_id) WHERE end_event_id IS NULL;
CREATE INDEX topic_follows_by_user ON topic_follows(user_id,created_at DESC,id DESC) WHERE end_event_id IS NULL;
CREATE INDEX topic_follows_by_event ON topic_follows(topic_id,start_event_id,end_event_id,user_id);
CREATE TABLE domain_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK(event_type IN ('topic_created','topic_updated','reply_created','resource_created','resource_updated','comment_created','visibility_changed')),
  actor_id TEXT REFERENCES users(id),
  topic_id TEXT REFERENCES topics(id),
  resource_id TEXT REFERENCES resources(id),
  topic_reply_id TEXT REFERENCES topic_replies(id),
  resource_comment_id TEXT REFERENCES resource_comments(id),
  notification_state TEXT NOT NULL DEFAULT 'pending' CHECK(notification_state IN ('pending','processing','done')),
  notification_attempts INTEGER NOT NULL DEFAULT 0 CHECK(notification_attempts>=0),
  notification_run_after INTEGER NOT NULL DEFAULT (unixepoch()),
  notification_lease_until INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(notification_state<>'processing' OR notification_lease_until IS NOT NULL),
  CHECK((topic_id IS NOT NULL)+(resource_id IS NOT NULL)+(topic_reply_id IS NOT NULL)+(resource_comment_id IS NOT NULL)=1),
  CHECK(
    (event_type IN ('topic_created','topic_updated') AND topic_id IS NOT NULL) OR
    (event_type='reply_created' AND topic_reply_id IS NOT NULL) OR
    (event_type IN ('resource_created','resource_updated') AND resource_id IS NOT NULL) OR
    (event_type='comment_created' AND resource_comment_id IS NOT NULL) OR
    event_type='visibility_changed'
  )
);
CREATE INDEX events_by_topic ON domain_events(topic_id,id);
CREATE INDEX events_by_resource ON domain_events(resource_id,id);
CREATE INDEX notification_outbox_due ON domain_events(notification_state,notification_run_after,id);
CREATE TABLE notifications (
  id TEXT PRIMARY KEY NOT NULL,
  recipient_id TEXT NOT NULL REFERENCES users(id),
  event_id INTEGER NOT NULL REFERENCES domain_events(id),
  reason TEXT NOT NULL CHECK(reason IN ('reply','follow','reference','system')),
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(recipient_id,event_id)
);
CREATE INDEX notifications_unread ON notifications(recipient_id,read_at,created_at DESC);
CREATE TABLE reports (
  id TEXT PRIMARY KEY NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  topic_id TEXT REFERENCES topics(id),
  topic_reply_id TEXT REFERENCES topic_replies(id),
  resource_id TEXT REFERENCES resources(id),
  resource_comment_id TEXT REFERENCES resource_comments(id),
  reason TEXT NOT NULL CHECK(reason IN ('inaccurate','spam','off_topic','sensitive','other')),
  detail TEXT NOT NULL DEFAULT '' CHECK(length(detail)<=2000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK((topic_id IS NOT NULL)+(topic_reply_id IS NOT NULL)+(resource_id IS NOT NULL)+(resource_comment_id IS NOT NULL)=1)
);
CREATE INDEX reports_by_reporter ON reports(reporter_id,created_at DESC,id DESC);
-- No operator accounts, management workflows, or moderation audit table in this baseline.
CREATE TABLE metadata_jobs (
  source_id TEXT PRIMARY KEY NOT NULL REFERENCES resource_sources(id),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','retry','idle')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  run_after INTEGER NOT NULL DEFAULT (unixepoch()),
  lease_until INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(state<>'running' OR lease_until IS NOT NULL)
);
CREATE INDEX metadata_due ON metadata_jobs(state,run_after);

-- Login state and write idempotency belong to the same authoritative backend.
CREATE TABLE oauth_login_states (
  state_hash TEXT PRIMARY KEY NOT NULL CHECK(length(state_hash)=64),
  provider TEXT NOT NULL COLLATE NOCASE CHECK(length(trim(provider))>0 AND provider=trim(provider)),
  browser_binding_hash TEXT NOT NULL CHECK(length(browser_binding_hash)=64),
  return_path TEXT NOT NULL DEFAULT '/' CHECK(substr(return_path,1,1)='/' AND substr(return_path,1,2)<>'//'),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(expires_at>created_at),
  CHECK(consumed_at IS NULL OR (consumed_at>=created_at AND consumed_at<=expires_at))
);
CREATE INDEX oauth_states_expiry ON oauth_login_states(expires_at);
CREATE TABLE idempotency_keys (
  user_id TEXT NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL CHECK(scope IN ('topic.create','topic.update','reply.create','comment.create','report.create')),
  request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 16 AND 128),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  response_status INTEGER NOT NULL CHECK(response_status BETWEEN 200 AND 299),
  response_json TEXT NOT NULL CHECK(json_valid(response_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,scope,request_key),
  CHECK(expires_at>created_at)
);
CREATE INDEX idempotency_expiry ON idempotency_keys(expires_at);

-- Always derive references from visible source content. No copied reply rows.
CREATE VIEW v_topic_resource_references AS
 SELECT rr.resource_id,t.id AS topic_id FROM resource_references rr
 JOIN topics t ON t.id=rr.topic_id JOIN resources r ON r.id=rr.resource_id
 WHERE t.visibility='visible' AND r.visibility='visible'
 UNION
 SELECT rr.resource_id,t.id FROM resource_references rr
 JOIN topic_replies tr ON tr.id=rr.topic_reply_id JOIN topics t ON t.id=tr.topic_id
 JOIN resources r ON r.id=rr.resource_id
 WHERE tr.visibility='visible' AND t.visibility='visible' AND r.visibility='visible';
CREATE VIEW v_topic_reply_counts AS
 SELECT t.id AS topic_id,count(tr.id) AS reply_count FROM topics t
 LEFT JOIN topic_replies tr ON tr.topic_id=t.id AND tr.visibility='visible'
 WHERE t.visibility='visible' GROUP BY t.id;
CREATE VIEW v_resource_signals AS
 SELECT r.id AS resource_id,g.stars,g.stars_observed_at,g.canonical_url AS stars_source_url,
 (SELECT count(*) FROM v_topic_resource_references x WHERE x.resource_id=r.id) AS discussion_reference_count,
 (SELECT count(*) FROM resource_comments c WHERE c.resource_id=r.id AND c.visibility='visible') AS comment_count,
 (SELECT count(*) FROM bookmarks b JOIN users u ON u.id=b.user_id WHERE b.resource_id=r.id AND u.status='active') AS bookmark_count,
 (SELECT count(*) FROM helpful_votes h JOIN resource_comments c ON c.id=h.resource_comment_id JOIN users u ON u.id=h.user_id WHERE c.resource_id=r.id AND c.visibility='visible' AND u.status='active') AS helpful_count
 FROM resources r LEFT JOIN resource_sources g ON g.id=(
   SELECT s.id FROM resource_sources s WHERE s.resource_id=r.id AND s.provider='github'
   ORDER BY s.is_primary DESC,s.created_at,s.id LIMIT 1
 ) WHERE r.visibility='visible';


-- Re-evaluate current visibility before notifications or MCP return an event.
CREATE VIEW v_public_domain_events AS
 SELECT e.* FROM domain_events e
 WHERE EXISTS (SELECT 1 FROM topics t WHERE t.id=e.topic_id AND t.visibility='visible')
 OR EXISTS (SELECT 1 FROM topic_replies tr JOIN topics t ON t.id=tr.topic_id
            WHERE tr.id=e.topic_reply_id AND tr.visibility='visible' AND t.visibility='visible')
 OR EXISTS (SELECT 1 FROM resources r WHERE r.id=e.resource_id AND r.visibility='visible')
 OR EXISTS (SELECT 1 FROM resource_comments c JOIN resources r ON r.id=c.resource_id
            WHERE c.id=e.resource_comment_id AND c.visibility='visible' AND r.visibility='visible');
