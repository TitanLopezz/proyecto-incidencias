CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS location geometry(Point, 4326);

CREATE INDEX IF NOT EXISTS incidents_location_gist_idx
  ON incidents USING GIST (location)
  WHERE location IS NOT NULL;
