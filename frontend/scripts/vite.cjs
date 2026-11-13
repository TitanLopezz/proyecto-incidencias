const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { ensureFrontend } = require('./ensure-frontend.cjs')

async function main() {
  ensureFrontend()
  await import(pathToFileURL(path.resolve(__dirname, '../node_modules/vite/bin/vite.js')).href)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
