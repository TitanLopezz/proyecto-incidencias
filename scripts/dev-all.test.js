const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isApiReady } = require('./dev-all')

test('solo reutiliza una API que confirme la conexión a PostgreSQL', async () => {
  const response = (body, status = 200) => async () => Response.json(body, { status })
  assert.equal(await isApiReady('http://localhost/api/health', response({ status: 'ok', database: 'connected' })), true)
  assert.equal(await isApiReady('http://localhost/api/health', response({ status: 'ok' })), false)
  assert.equal(await isApiReady('http://localhost/api/health', response({ database: 'disconnected' }, 503)), false)
  assert.equal(await isApiReady('http://localhost/api/health', async () => new Response('<html>Vite</html>')), false)
  assert.equal(await isApiReady('http://localhost/api/health', async () => { throw new Error('ECONNREFUSED') }), false)
})
