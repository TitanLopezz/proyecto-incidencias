const { Pool } = require('pg')
const loadConfig = require('../config/loadConfig')

class DatabaseConnection {
  static instance = null

  constructor(config) {
    const hasDatabaseUrl = typeof config.databaseUrl === 'string' && config.databaseUrl.length > 0
    if (!hasDatabaseUrl && (!config.databaseHost || !config.databaseName || !config.databaseUser)) {
      throw new Error(
        'Configura DATABASE_URL o DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD.',
      )
    }

    const ssl = config.databaseSsl
      ? {
          rejectUnauthorized: config.databaseSslRejectUnauthorized,
          ...(config.databaseSslCa ? { ca: config.databaseSslCa } : {}),
        }
      : undefined

    this.pool = new Pool({
      ...(hasDatabaseUrl
        ? { connectionString: config.databaseUrl }
        : {
            host: config.databaseHost,
            port: config.databasePort,
            database: config.databaseName,
            user: config.databaseUser,
            password: config.databasePassword,
          }),
      ...(ssl ? { ssl } : {}),
      max: config.databasePoolMax,
      connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
      idleTimeoutMillis: 30000,
    })
    this.pool.on('error', (error) => {
      console.error('Error inesperado en el pool de PostgreSQL:', error)
    })
    this.isClosed = false
  }

  static getInstance(config) {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection(config ?? loadConfig())
    }

    return DatabaseConnection.instance
  }

  query(text, parameters) {
    if (this.isClosed) {
      throw new Error('La conexión a PostgreSQL ya está cerrada.')
    }

    return this.pool.query(text, parameters)
  }

  connect() {
    if (this.isClosed) {
      throw new Error('La conexión a PostgreSQL ya está cerrada.')
    }

    return this.pool.connect()
  }

  async close() {
    if (this.isClosed) {
      return
    }

    this.isClosed = true
    try {
      await this.pool.end()
    } finally {
      if (DatabaseConnection.instance === this) {
        DatabaseConnection.instance = null
      }
    }
  }
}

module.exports = DatabaseConnection
