// Fictitious credentials for the isolated verification stack only.
const fs = require('node:fs')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const dir = path.resolve(__dirname, '../output/aws-verify/secrets')
fs.mkdirSync(dir, { recursive: true })
for (const [name, content] of Object.entries({
  app: { DB_PASSWORD: randomBytes(24).toString('hex') }, jwt: { JWT_SECRET: randomBytes(24).toString('hex') },
  rds: { username: 'verify', password: 'disposable-verify-only' },
  'admin-one': { password: randomBytes(24).toString('hex') }, 'admin-two': { password: randomBytes(24).toString('hex') },
})) fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(content), { mode: 0o600 })
console.log('Disposable TLS test credentials prepared. No AWS resources or real credentials used.')
