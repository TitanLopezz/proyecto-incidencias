WITH sample(title, description, category_code, status, latitude, longitude) AS (
  VALUES
    (
      'Muestra: bache en avenida',
      'Registro de prueba para verificar la categoría y el mapa.',
      'bache',
      'abierta',
      19.4326::double precision,
      -99.1332::double precision
    ),
    (
      'Muestra: luminaria apagada',
      'Registro de prueba para verificar el seguimiento del estatus.',
      'alumbrado',
      'en_proceso',
      19.4270::double precision,
      -99.1677::double precision
    ),
    (
      'Muestra: acumulación de basura',
      'Registro de prueba sin ubicación para validar los reportes telefónicos.',
      'basura',
      'abierta',
      NULL::double precision,
      NULL::double precision
    )
),
created AS (
  INSERT INTO incidents (title, description, category_code, status, location)
  SELECT sample.title, sample.description, sample.category_code, sample.status,
         CASE
           WHEN sample.longitude IS NULL THEN NULL
           ELSE ST_SetSRID(
             ST_MakePoint(sample.longitude, sample.latitude),
             4326
           )::geometry(Point, 4326)
         END
  FROM sample
  WHERE NOT EXISTS (
    SELECT 1
    FROM incidents AS existing
    WHERE existing.title = sample.title
      AND existing.description = sample.description
  )
  RETURNING id, status, created_by
)
INSERT INTO incident_status_history
  (incident_id, previous_status, new_status, changed_by)
SELECT id, NULL, status, created_by
FROM created;

INSERT INTO incident_status_history
  (incident_id, previous_status, new_status, changed_at, changed_by)
SELECT incidents.id, NULL, incidents.status, incidents.created_at, incidents.created_by
FROM incidents
WHERE incidents.title LIKE 'Muestra:%'
  AND NOT EXISTS (
    SELECT 1
    FROM incident_status_history AS history
    WHERE history.incident_id = incidents.id
  );

INSERT INTO evidences (incident_id, photo_url)
SELECT incidents.id, 'https://example.invalid/incidencias/muestra-bache.jpg'
FROM incidents
WHERE incidents.title = 'Muestra: bache en avenida'
  AND NOT EXISTS (
    SELECT 1
    FROM evidences
    WHERE evidences.incident_id = incidents.id
    AND evidences.photo_url = 'https://example.invalid/incidencias/muestra-bache.jpg'
  );
