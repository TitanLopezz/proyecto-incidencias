const fs = require('node:fs/promises')
const path = require('node:path')

async function migrateDatabase(pool) {
  const migrationsDirectory = path.join(__dirname, 'migrations')
  const migrations = (await fs.readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith('.sql'))
    .sort()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [741852, 963])
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    for (const filename of migrations) {
      const alreadyApplied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [filename],
      )
      if (alreadyApplied.rowCount > 0) {
        continue
      }

      const migration = await fs.readFile(path.join(migrationsDirectory, filename), 'utf8')
      await client.query(migration)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [filename])
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

module.exports = migrateDatabase
