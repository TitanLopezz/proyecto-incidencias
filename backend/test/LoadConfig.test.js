const test = require('node:test')
const assert = require('node:assert/strict')
const loadConfig = require('../src/infrastructure/config/loadConfig')

const developmentEnvironment = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://localhost/incidencias',
  JWT_SECRET: 'a-secret-that-is-at-least-32-bytes-long',
}

test('loadConfig rejects URL options that override the configured PostgreSQL TLS policy', () => {
  for (const option of ['sslmode=disable', 'sslmode=no-verify', 'ssl=false', 'sslrootcert=other.pem']) {
    assert.throws(() => loadConfig({
      ...developmentEnvironment,
      DATABASE_URL: `postgres://localhost/incidencias?${option}`,
    }), /elimina los parámetros ssl/)
  }
  assert.throws(() => loadConfig({
    ...developmentEnvironment, DATABASE_URL: 'https://localhost/database',
  }), /postgres/)
})

test('loadConfig configures local defaults and supports several frontend origins', () => {
  const defaultConfig = loadConfig(developmentEnvironment)
  assert.deepEqual(defaultConfig.frontendOrigins, [
    'http://localhost:5175',
    'http://127.0.0.1:5175',
  ])

  const config = loadConfig({
    ...developmentEnvironment,
    FRONTEND_ORIGIN: 'http://localhost:5175, http://127.0.0.1:5175',
  })

  assert.equal(config.port, 3000)
  assert.deepEqual(config.frontendOrigins, [
    'http://localhost:5175',
    'http://127.0.0.1:5175',
  ])
  assert.equal(config.databaseSsl, false)

  const postgresEnvironmentConfig = loadConfig({
    ...developmentEnvironment,
    DATABASE_URL: '',
    POSTGRES_DB: 'local_incidents',
    POSTGRES_USER: 'local_admin',
    POSTGRES_PASSWORD: 'local-password',
  })
  assert.equal(postgresEnvironmentConfig.databaseHost, '127.0.0.1')
  assert.equal(postgresEnvironmentConfig.databaseName, 'local_incidents')
  assert.equal(postgresEnvironmentConfig.databaseUser, 'local_admin')
  assert.equal(postgresEnvironmentConfig.databasePassword, 'local-password')

  const databaseVariableConfig = loadConfig({
    ...developmentEnvironment,
    DB_HOST: 'db.local',
    DB_PORT: '5544',
    DB_NAME: 'incidents',
    DB_USER: 'postgres',
    DB_PASSWORD: 'database-password',
  })
  assert.equal(databaseVariableConfig.databaseUrl, undefined)
  assert.equal(databaseVariableConfig.databaseHost, 'db.local')
  assert.equal(databaseVariableConfig.databasePort, 5544)
  assert.equal(databaseVariableConfig.databaseName, 'incidents')
  assert.equal(databaseVariableConfig.databaseUser, 'postgres')
  assert.equal(databaseVariableConfig.databasePassword, 'database-password')
  assert.throws(
    () => loadConfig({
      ...developmentEnvironment,
      DB_NAME: 'incidents',
      DB_USER: 'postgres',
      DB_PASSWORD: 'password',
    }),
    /DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD/,
  )
})

test('loadConfig requires production origins, a private secret, and PostgreSQL TLS', () => {
  const productionEnvironment = {
    ...developmentEnvironment,
    NODE_ENV: 'production',
    FRONTEND_ORIGIN: 'https://app.example.com',
    DATABASE_SSL: 'true',
  }

  assert.equal(loadConfig(productionEnvironment).isProduction, true)
  assert.throws(
    () => loadConfig({ ...productionEnvironment, FRONTEND_ORIGIN: 'http://app.example.com' }),
    /HTTPS/,
  )
  assert.throws(
    () => loadConfig({ ...productionEnvironment, DATABASE_SSL: 'false' }),
    /DATABASE_SSL=true/,
  )
  assert.throws(
    () => loadConfig({ ...productionEnvironment, JWT_SECRET: 'development-secret-change-this-value' }),
    /JWT_SECRET/,
  )
  assert.throws(
    () => loadConfig({ ...productionEnvironment, DATABASE_SSL_REJECT_UNAUTHORIZED: 'false' }),
    /certificados TLS/,
  )
})
