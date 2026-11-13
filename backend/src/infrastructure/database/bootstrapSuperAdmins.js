require('../config/loadEnvironment')()

const loadConfig = require('../config/loadConfig')
const DatabaseConnection = require('./connection')
const BcryptPasswordHasher = require('../security/BcryptPasswordHasher')

const BOOTSTRAP_ACCOUNTS = [
  { name: 'Superadministrador 1', email: 'superadmin1@incidencias.local' },
  { name: 'Superadministrador 2', email: 'superadmin2@incidencias.local' },
]

function readSuperAdminCredentials(environment = process.env) {
  return BOOTSTRAP_ACCOUNTS.map((account, index) => {
    const variableName = `SUPERADMIN${index + 1}_PASSWORD`
    const password = environment[variableName]
    const passwordLength = typeof password === 'string'
      ? Buffer.byteLength(password, 'utf8')
      : 0

    if (passwordLength < 8 || passwordLength > 72) {
      throw new Error(`${variableName} debe tener entre 8 y 72 bytes.`)
    }

    return { ...account, password }
  })
}

async function bootstrapSuperAdmins() {
  const config = loadConfig()
  const credentials = readSuperAdminCredentials()
  const database = DatabaseConnection.getInstance(config)
  const passwordHasher = new BcryptPasswordHasher()
  const passwordHashes = await Promise.all(
    credentials.map(({ password }) => passwordHasher.hash(password)),
  )
  let client
  let transactionStarted = false

  try {
    client = await database.connect()
    await client.query('BEGIN')
    transactionStarted = true
    await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [741852, 964])

    for (let index = 0; index < credentials.length; index += 1) {
      const { name, email } = credentials[index]
      await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'superadmin')
         ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash,
             role = 'superadmin'`,
        [name, email, passwordHashes[index]],
      )
    }

    await client.query(
      `INSERT INTO superadmin_bootstrap
         (singleton, account_one_email, account_two_email)
       VALUES (TRUE, $1, $2)
       ON CONFLICT (singleton) DO UPDATE
       SET account_one_email = EXCLUDED.account_one_email,
           account_two_email = EXCLUDED.account_two_email,
           bootstrapped_at = NOW()`,
      [credentials[0].email, credentials[1].email],
    )
    await client.query('COMMIT')
    transactionStarted = false

    for (const { email } of credentials) {
      console.log(`Cuenta de superadministrador verificada: ${email}`)
    }
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK')
    }

    throw error
  } finally {
    client?.release()
    await database.close()
  }
}

if (require.main === module) {
  bootstrapSuperAdmins().catch((error) => {
    console.error('No se pudieron garantizar los superadministradores:', error.message)
    process.exitCode = 1
  })
}

module.exports = { bootstrapSuperAdmins, readSuperAdminCredentials }
