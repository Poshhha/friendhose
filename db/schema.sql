PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
  category TEXT NOT NULL CHECK(category IN ('Thoughts','Confessions','Questions','Random')),
  alias TEXT NOT NULL,
  author_hash TEXT NOT NULL,
  delete_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  alias TEXT NOT NULL,
  PRIMARY KEY(post_id, token_hash),
  UNIQUE(post_id, alias)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES comments(id) ON DELETE SET NULL,
  parent_alias TEXT,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
  alias TEXT NOT NULL,
  author_hash TEXT NOT NULL,
  delete_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_post_created ON comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS posts_created ON posts(created_at DESC);

CREATE TABLE IF NOT EXISTS reactions (
  target_type TEXT NOT NULL CHECK(target_type IN ('post','comment')),
  target_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  PRIMARY KEY(target_type, target_id, token_hash)
);
CREATE INDEX IF NOT EXISTS reactions_target ON reactions(target_type, target_id);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK(target_type IN ('post','comment')),
  target_id TEXT NOT NULL,
  reporter_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('Spam','Harmful content','Personal information','Other')),
  details TEXT NOT NULL DEFAULT '' CHECK(length(details) <= 500),
  created_at INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN (0,1)),
  UNIQUE(target_type, target_id, reporter_hash)
);
CREATE INDEX IF NOT EXISTS reports_unresolved ON reports(resolved, created_at);
PRAGMA user_version = 1;
