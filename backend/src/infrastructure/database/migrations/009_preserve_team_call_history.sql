ALTER TABLE llamadas_equipo
  ADD COLUMN IF NOT EXISTS contacto_nombre VARCHAR(120),
  ADD COLUMN IF NOT EXISTS contacto_equipo VARCHAR(120),
  ADD COLUMN IF NOT EXISTS contacto_telefono VARCHAR(20);

UPDATE llamadas_equipo AS l
SET contacto_nombre = c.nombre,
    contacto_equipo = c.equipo,
    contacto_telefono = c.telefono
FROM contactos_equipo AS c
WHERE l.contacto_id = c.id
  AND (l.contacto_nombre IS NULL OR l.contacto_equipo IS NULL OR l.contacto_telefono IS NULL);

ALTER TABLE llamadas_equipo
  ALTER COLUMN contacto_nombre SET NOT NULL,
  ALTER COLUMN contacto_equipo SET NOT NULL,
  ALTER COLUMN contacto_telefono SET NOT NULL,
  ALTER COLUMN contacto_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS llamadas_equipo_contacto_id_fkey,
  ADD CONSTRAINT llamadas_equipo_contacto_id_fkey
    FOREIGN KEY (contacto_id) REFERENCES contactos_equipo(id) ON DELETE SET NULL;
