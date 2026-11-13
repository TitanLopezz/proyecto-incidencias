-- Migración 007: Soporte para Triage Automático e índices optimizados
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'BAJA',
  ADD COLUMN IF NOT EXISTS triage_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_priority_check'
  ) THEN
    ALTER TABLE incidents
      ADD CONSTRAINT incidents_priority_check
      CHECK (priority IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS incidents_priority_status_idx
  ON incidents (priority, status);

CREATE INDEX IF NOT EXISTS incidents_active_location_idx
  ON incidents USING GIST (location)
  WHERE status IN ('abierta', 'en_proceso') AND location IS NOT NULL;
