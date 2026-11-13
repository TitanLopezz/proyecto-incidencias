const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ensureFrontend } = require('../frontend/scripts/ensure-frontend.cjs')

const rootDirectory = path.resolve(__dirname, '..')
const backendDirectory = path.join(rootDirectory, 'backend')
const frontendDirectory = path.join(rootDirectory, 'frontend')
const dotenv = require(require.resolve('dotenv', { paths: [backendDirectory] }))
const envPath = path.join(rootDirectory, '.env')
const fileEnvironment = fs.existsSync(envPath)
  ? dotenv.parse(fs.readFileSync(envPath))
  : {}
const environment = { ...fileEnvironment, ...process.env }
const apiUrlValue = environment.VITE_API_URL
const children = new Set()
let stopping = false
let backendExit

function getEnvironment() {
  if (!apiUrlValue) {
    throw new Error('Define VITE_API_URL en el archivo .env de la raíz.')
  }

  let apiUrl
  try {
    apiUrl = new URL(apiUrlValue)
  } catch {
    throw new Error('VITE_API_URL debe ser una URL absoluta para el desarrollo local.')
  }

  if (!['http:', 'https:'].includes(apiUrl.protocol)) {
    throw new Error('VITE_API_URL debe usar HTTP o HTTPS.')
  }

  const port = Number(environment.PORT || apiUrl.port || 3001)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un puerto válido.')
  }

  const childEnvironment = {
    ...environment,
    NODE_ENV: 'development',
    PORT: String(port),
    VITE_API_URL: apiUrlValue,
    MIGRATE_ON_START: environment.MIGRATE_ON_START || 'true',
  }

  const isWsl = process.platform === 'linux' && /microsoft/i.test(os.release())
  const configuredDatabaseHost = childEnvironment.DB_HOST || childEnvironment.PGHOST
    || childEnvironment.POSTGRES_HOST
  if (isWsl && !childEnvironment.DATABASE_URL
    && (!configuredDatabaseHost || ['localhost', '127.0.0.1', '::1'].includes(configuredDatabaseHost))) {
    const route = spawnSync('ip', ['route', 'show', 'default'], { encoding: 'utf8' })
    const gateway = route.stdout?.match(/\bdefault via ([^\s]+)/)?.[1]
    if (gateway) {
      childEnvironment.PGHOST = gateway
      childEnvironment.DB_HOST = gateway
      console.log(`PostgreSQL de Windows desde WSL: ${gateway}`)
    }
  }

  const healthUrl = new URL(apiUrl.pathname.replace(/\/+$/, '') + '/health', apiUrl.origin)
  return { childEnvironment, healthUrl, port }
}

function stopChildren(signal = 'SIGTERM') {
  if (stopping) {
    return
  }
  stopping = true
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal)
    }
  }
}

function startChild(entryPoint, cwd, childEnvironment) {
  const child = spawn(process.execPath, [entryPoint], {
    cwd,
    env: childEnvironment,
    stdio: 'inherit',
  })
  children.add(child)
  child.once('error', (error) => {
    console.error(`No se pudo iniciar ${path.basename(entryPoint)}: ${error.message}`)
    process.exitCode = 1
    stopChildren()
  })
  child.once('exit', (code, signal) => {
    children.delete(child)
    if (!stopping) {
      backendExit = { code, signal }
      if (code !== 0) {
        console.error(`${path.basename(entryPoint)} terminó con código ${code ?? signal}.`)
        process.exitCode = code || 1
      }
      stopChildren()
    }
  })
  return child
}

async function waitForHealth(backend, healthUrl) {
  const deadline = Date.now() + 60000
  let lastError

  while (Date.now() < deadline) {
    if (backendExit) {
      throw new Error(
        `El backend terminó antes de estar listo (código ${backendExit.code ?? backendExit.signal}).`,
      )
    }

    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) })
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error('El endpoint de salud no devolvió JSON.')
      }
      const body = await response.json()
      if (response.status === 200 && body.status === 'ok' && body.database === 'connected') {
        return
      }
      if (response.status >= 500) {
        throw new Error(body.error?.message || `El backend devolvió HTTP ${response.status}.`)
      }
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error
      }
      lastError = error
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(
    `El backend no respondió en ${healthUrl.href} después de 60 segundos.${lastError ? ` ${lastError.message}` : ''}`,
  )
}

async function startDevelopment() {
  const { childEnvironment, healthUrl } = getEnvironment()
  ensureFrontend()

  if (await isApiReady(healthUrl)) {
    console.log(`API y PostgreSQL ya disponibles en ${healthUrl.origin}.`)
  } else {
    const backend = startChild(
      path.join(backendDirectory, 'src', 'index.js'),
      backendDirectory,
      childEnvironment,
    )
    await waitForHealth(backend, healthUrl)
  }
  console.log(`Backend listo en ${healthUrl.origin}; iniciando frontend.`)

  try {
    const response = await fetch('http://localhost:5175/@vite/client', {
      signal: AbortSignal.timeout(3000),
    })
    if (response.ok && (await response.text()).includes('vite')) {
      console.log('Frontend ya disponible en http://localhost:5175. Recarga la página.')
      return
    }
  } catch {
    // Vite no está iniciado; el proceso siguiente comprobará su puerto.
  }

  startChild(
    path.join(frontendDirectory, 'node_modules', 'vite', 'bin', 'vite.js'),
    frontendDirectory,
    childEnvironment,
  )
}

async function isApiReady(healthUrl, request = fetch) {
  try {
    const response = await request(healthUrl, { signal: AbortSignal.timeout(5000) })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      return false
    }
    const body = await response.json()
    return body.status === 'ok' && body.database === 'connected'
  } catch {
    return false
  }
}

process.once('SIGINT', () => stopChildren('SIGINT'))
process.once('SIGTERM', () => stopChildren('SIGTERM'))

if (require.main === module) startDevelopment().catch((error) => {
  console.error(`No se pudo iniciar el entorno de desarrollo: ${error.message}`)
  process.exitCode = 1
  stopChildren()
})

module.exports = { isApiReady }
