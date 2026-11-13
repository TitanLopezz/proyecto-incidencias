const { spawnSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const frontend = path.resolve(__dirname, '..')

function check() {
  return spawnSync(process.execPath, ['--input-type=module', '-e', "await import('rolldown')"], {
    cwd: frontend, encoding: 'utf8',
  })
}

function ensureFrontend() {
  const initial = check()
  if (initial.status === 0) return
  const manifestPath = path.join(frontend, 'node_modules/rolldown/package.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Faltan las dependencias del frontend. Ejecuta npm ci --include=optional en frontend.')
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const libc = process.platform === 'linux'
    ? (process.report.getReport().header.glibcVersionRuntime ? 'gnu' : 'musl')
    : null
  const suffix = process.platform === 'win32' ? `win32-${process.arch}-msvc`
    : process.platform === 'darwin' ? `darwin-${process.arch}`
    : process.platform === 'linux' ? `linux-${process.arch}-${libc}`
    : `${process.platform}-${process.arch}`
  const binding = `@rolldown/binding-${suffix}`
  const version = manifest.optionalDependencies?.[binding]
  if (!version || !(initial.stderr || '').includes('Cannot find native binding')) {
    throw new Error(initial.stderr || initial.error?.message || 'No se pudo cargar Rolldown.')
  }
  console.log(`Reparando Rolldown para ${process.platform}/${process.arch}: ${binding}@${version}`)
  // Invoke npm through Node to avoid shell quoting and Windows .cmd differences.
  const npmCli = process.env.npm_execpath
  if (!npmCli || !fs.existsSync(npmCli)) {
    throw new Error('Inicia mediante npm run dev o npm run dev:all para poder reparar las dependencias.')
  }
  const install = spawnSync(process.execPath, [npmCli, 'install', '--no-save', '--package-lock=false',
    '--include=optional', '--include=dev', `${binding}@${version}`], {
    cwd: frontend, stdio: 'inherit',
  })
  if (install.status !== 0) {
    throw new Error('No se pudo instalar el binding de Rolldown. Revisa la conexión y el acceso al registro npm.')
  }
  const repaired = check()
  if (repaired.status !== 0) {
    throw new Error(repaired.stderr || 'Rolldown sigue sin poder cargar su binding nativo.')
  }
  console.log('Rolldown listo; continuando el arranque.')
}

module.exports = { ensureFrontend }
if (require.main === module) {
  try { ensureFrontend() } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

