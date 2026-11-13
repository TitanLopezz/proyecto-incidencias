const test = require('node:test')
const assert = require('node:assert/strict')
const migrateDatabase = require('../src/infrastructure/database/migrate')

test('migrateDatabase applies pending migrations once inside an advisory-locked transaction', async () => {
  const appliedMigrations = new Set()
  const statements = []
  let released = false
  const client = {
    async query(sql, parameters = []) {
      statements.push(sql)
      if (sql.includes('SELECT 1 FROM schema_migrations')) {
        return { rowCount: appliedMigrations.has(parameters[0]) ? 1 : 0, rows: [] }
      }

      if (sql.includes('INSERT INTO schema_migrations')) {
        appliedMigrations.add(parameters[0])
      }

      return { rowCount: 0, rows: [] }
    },
    release() {
      released = true
    },
  }
  const pool = {
    async connect() {
      return client
    },
  }

  await migrateDatabase(pool)
  assert.deepEqual([...appliedMigrations].sort(), [
    '001_create_incidents.sql',
    '002_create_users.sql',
    '003_add_roles_and_incident_ownership.sql',
    '004_add_incident_geolocation.sql',
    '005_create_notifications_table.sql',
    '006_add_incident_categories_history_and_evidence.sql',
    '007_add_incident_triage_and_spatial_indexes.sql',
    '008_create_contactos_y_llamadas.sql',
    '009_preserve_team_call_history.sql',
    '010_link_telegram_chats.sql',
    '011_archive_incidents.sql',
    '012_incident_assignments.sql',
    '013_reliable_incident_notifications.sql',
  ])
  assert.equal(statements[0], 'BEGIN')
  assert.match(statements[1], /pg_advisory_xact_lock/)
  assert.equal(statements.at(-1), 'COMMIT')
  assert.equal(released, true)

  statements.length = 0
  released = false
  await migrateDatabase(pool)
  assert.equal(statements.filter((statement) => statement.startsWith('CREATE TABLE IF NOT EXISTS incidents')).length, 0)
  assert.equal(statements.at(-1), 'COMMIT')
  assert.equal(released, true)
})

test('migrateDatabase rolls back and releases the connection after a failed migration', async () => {
  const statements = []
  const client = {
    async query(sql) {
      statements.push(sql)
      if (sql.includes('CREATE TABLE IF NOT EXISTS incidents')) {
        throw new Error('Migration failed')
      }

      return { rowCount: 0, rows: [] }
    },
    release() {
      statements.push('RELEASE')
    },
  }

  await assert.rejects(migrateDatabase({ async connect() { return client } }), /Migration failed/)
  assert.equal(statements.includes('ROLLBACK'), true)
  assert.equal(statements.at(-1), 'RELEASE')
})
