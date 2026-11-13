require('../config/loadEnvironment')()

const loadConfig = require('../config/loadConfig')
const DatabaseConnection = require('./connection')
const migrateDatabase = require('./migrate')

async function runMigrations() {
  const config = loadConfig()
  const database = DatabaseConnection.getInstance(config)

  try {
    await migrateDatabase(database)
    console.log('Migraciones aplicadas correctamente.')
  } finally {
    await database.close()
  }
}

runMigrations().catch((error) => {
  console.error('No se pudieron aplicar las migraciones:', error)
  process.exitCode = 1
})
