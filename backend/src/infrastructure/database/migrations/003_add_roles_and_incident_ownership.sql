ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'citizen';

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('citizen', 'admin', 'superadmin')) NOT VALID;

ALTER TABLE users
  VALIDATE CONSTRAINT users_role_check;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS superadmin_bootstrap (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  account_one_email VARCHAR(254) NOT NULL,
  account_two_email VARCHAR(254) NOT NULL,
  bootstrapped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (account_one_email <> account_two_email)
);

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS incidents_created_by_created_at_idx
  ON incidents (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS users_role_created_at_idx
  ON users (role, created_at DESC);
