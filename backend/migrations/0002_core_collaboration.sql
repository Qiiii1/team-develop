CREATE TABLE collaboration_contexts (
  team_id TEXT NOT NULL REFERENCES teams(id),
  version INTEGER NOT NULL CHECK (version >= 0),
  snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, version)
);
--> statement-breakpoint
CREATE TABLE collaboration_threads (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  context_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (team_id, context_version) REFERENCES collaboration_contexts(team_id, version)
);
--> statement-breakpoint
CREATE INDEX collaboration_threads_owner ON collaboration_threads(team_id, owner_id, updated_at);
--> statement-breakpoint
CREATE TABLE collaboration_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  thread_id TEXT REFERENCES collaboration_threads(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  context_version INTEGER NOT NULL,
  reply_to_id TEXT REFERENCES collaboration_messages(id),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (team_id, context_version) REFERENCES collaboration_contexts(team_id, version)
);
--> statement-breakpoint
CREATE INDEX collaboration_messages_scope ON collaboration_messages(team_id, thread_id, seq);
--> statement-breakpoint
CREATE TABLE collaboration_runs (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  thread_id TEXT REFERENCES collaboration_threads(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  prompt_id TEXT UNIQUE NOT NULL REFERENCES collaboration_messages(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  error TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
--> statement-breakpoint
CREATE UNIQUE INDEX collaboration_one_active_call ON collaboration_runs(user_id) WHERE status = 'pending';
--> statement-breakpoint
CREATE TABLE collaboration_shares (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  source_message_id TEXT REFERENCES collaboration_messages(id),
  basis_version INTEGER NOT NULL,
  review_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (team_id, basis_version) REFERENCES collaboration_contexts(team_id, version)
);
--> statement-breakpoint
CREATE INDEX collaboration_shares_team ON collaboration_shares(team_id, created_at);
--> statement-breakpoint
CREATE TABLE collaboration_documents (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id),
  kind TEXT NOT NULL CHECK (kind IN ('background', 'decision')),
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX collaboration_documents_team ON collaboration_documents(team_id, created_at);
--> statement-breakpoint
CREATE TABLE collaboration_versions (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL REFERENCES collaboration_documents(id),
  version INTEGER NOT NULL,
  base_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  source_message_id TEXT REFERENCES collaboration_messages(id),
  basis_version INTEGER NOT NULL,
  review_note TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL REFERENCES users(id),
  confirmer_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  UNIQUE (document_id, version)
);
