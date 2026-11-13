CREATE TABLE telegram_links (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id VARCHAR(16) UNIQUE,
  code_hash CHAR(64) UNIQUE,
  code_expires_at TIMESTAMPTZ,
  CHECK ((code_hash IS NULL) = (code_expires_at IS NULL))
);
