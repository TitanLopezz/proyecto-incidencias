ALTER TABLE incidents
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD COLUMN archived_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN archive_reason VARCHAR(500),
  ADD CONSTRAINT incidents_archive_complete CHECK (
    (archived_at IS NULL AND archived_by IS NULL AND archive_reason IS NULL)
    OR (archived_at IS NOT NULL AND archived_by IS NOT NULL
        AND archive_reason IS NOT NULL AND length(btrim(archive_reason)) > 0)
  );

CREATE INDEX incidents_archived_at_idx ON incidents (archived_at DESC, id)
  WHERE archived_at IS NOT NULL;
