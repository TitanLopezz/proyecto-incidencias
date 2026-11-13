CREATE TABLE incident_assignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
  contact_id UUID REFERENCES contactos_equipo(id) ON DELETE SET NULL,
  team_name VARCHAR(120) NOT NULL,
  contact_name VARCHAR(120) NOT NULL,
  assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX incident_assignments_latest_idx
  ON incident_assignments (incident_id, id DESC);
