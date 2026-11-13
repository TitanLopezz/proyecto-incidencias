// Production launcher. Only migration/seed jobs receive the RDS master secret.
const fs = require('node:fs')
const { Pool } = require('pg')
const loadConfig = require('../src/infrastructure/config/loadConfig')
const migrate = require('../src/infrastructure/database/migrate')

function secret(filename) {
  return JSON.parse(fs.readFileSync(`/run/incidencias/${filename}.json`, 'utf8'))
}

async function main() {
  const mode = process.argv[2] || 'serve'
  if (!['serve', 'migrate', 'seed'].includes(mode)) throw new Error('Modo de arranque inválido.')
  const app = secret('app')
  process.env.JWT_SECRET = secret('jwt').JWT_SECRET
  process.env.DATABASE_SSL_CA = fs.readFileSync('/run/incidencias/rds-ca.pem', 'utf8')
  if (mode === 'serve') {
    process.env.DB_USER = 'incidencias_app'
    process.env.DB_PASSWORD = app.DB_PASSWORD
    if (app.TELEGRAM_INTEGRATION_KEY) process.env.TELEGRAM_INTEGRATION_KEY = app.TELEGRAM_INTEGRATION_KEY
    if (app.TELEGRAM_BOT_TOKEN) process.env.TELEGRAM_BOT_TOKEN = app.TELEGRAM_BOT_TOKEN
    require('../src/index')
    return
  }
  const admin = secret('rds')
  process.env.DB_USER = admin.username
  process.env.DB_PASSWORD = admin.password
  if (mode === 'seed') {
    process.env.SUPERADMIN1_PASSWORD = secret('admin-one').password
    process.env.SUPERADMIN2_PASSWORD = secret('admin-two').password
    await require('../src/infrastructure/database/bootstrapSuperAdmins').bootstrapSuperAdmins()
    return
  }
  const config = loadConfig()
  const pool = new Pool({
    host: config.databaseHost, port: config.databasePort, database: config.databaseName,
    user: config.databaseUser, password: config.databasePassword,
    ssl: { rejectUnauthorized: true, ca: config.databaseSslCa },
    max: 2, connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
  })
  try {
    await migrate(pool)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(741852, 965)')
      if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'incidencias_app'")).rowCount) {
        await client.query('CREATE ROLE incidencias_app LOGIN')
      }
      const { rows } = await client.query("SELECT format('ALTER ROLE incidencias_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', $1::text) AS sql", [app.DB_PASSWORD])
      await client.query(rows[0].sql)
      await client.query('GRANT CONNECT ON DATABASE incidencias TO incidencias_app')
      await client.query('GRANT USAGE ON SCHEMA public TO incidencias_app')
      await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO incidencias_app')
      await client.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO incidencias_app')
      await client.query('REVOKE ALL ON schema_migrations, superadmin_bootstrap FROM incidencias_app')
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
    console.log('Migraciones y permisos de aplicación preparados.')
  } finally { await pool.end() }
}

main().catch(error => {
  // Never log connection objects, queries or secret values.
  console.error(`No se pudo completar el arranque (${error.code || error.name}). Revisa conectividad, TLS y migraciones.`)
  process.exitCode = 1
})
