const test = require('node:test')
const assert = require('node:assert/strict')
const DatabaseConnection = require('../src/infrastructure/database/connection')
const loadConfig = require('../src/infrastructure/config/loadConfig')

function connectionConfig() {
  return loadConfig({
    NODE_ENV: 'development',
    DB_HOST: '127.0.0.1',
    DB_PORT: '1',
    DB_NAME: 'incidencias_test',
    DB_USER: 'postgres',
    DB_PASSWORD: 'test-password',
    JWT_SECRET: 'a-secret-that-is-at-least-32-bytes-long',
  })
}

test('DatabaseConnection returns one pool wrapper and can be closed cleanly', async () => {
  const connection = DatabaseConnection.getInstance(connectionConfig())
  const sameConnection = DatabaseConnection.getInstance({
    ...connectionConfig(),
    databaseName: 'ignored-database',
  })

  assert.equal(sameConnection, connection)
  await connection.close()
  assert.throws(() => connection.query('SELECT 1'), /ya está cerrada/)

  const nextConnection = DatabaseConnection.getInstance(connectionConfig())
  assert.notEqual(nextConnection, connection)
  await nextConnection.close()
})

test('DatabaseConnection.query propagates PostgreSQL connection failures', async () => {
  const connection = DatabaseConnection.getInstance(connectionConfig())
  try {
    await assert.rejects(connection.query('SELECT 1'), /ECONNREFUSED/)
  } finally {
    await connection.close()
  }
})
