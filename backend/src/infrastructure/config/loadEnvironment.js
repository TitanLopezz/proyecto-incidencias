const path = require('node:path')
const dotenv = require('dotenv')

function loadEnvironment() {
  const rootEnvPath = path.resolve(__dirname, '../../../../.env')
  const result = dotenv.config({ path: rootEnvPath })

  if (result.error && result.error.code !== 'ENOENT') {
    throw result.error
  }
}

module.exports = loadEnvironment
