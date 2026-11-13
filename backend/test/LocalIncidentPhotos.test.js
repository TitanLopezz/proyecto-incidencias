const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { once } = require('node:events')
const sharp = require('sharp')
const { LocalIncidentPhotos, MAX_BYTES } = require('../src/infrastructure/persistence/LocalIncidentPhotos')
const createApp = require('../src/infrastructure/http/createApp')

const incidentId = 'c4f9f564-6283-40ca-bd14-3f66eb1da4b3'
const owner = { userId: 'owner', role: 'citizen' }

function database() {
  const photos = new Map()
  return {
    photos,
    archivedAt: null,
    async query(sql, args = []) {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] }
      if (sql.startsWith('SELECT created_by')) return { rows: args[0] === incidentId ? [{ created_by: owner.userId, archived_at: this.archivedAt }] : [] }
      if (sql.includes('COUNT(*)')) return { rows: [{ count: photos.size }] }
      if (sql.startsWith('INSERT INTO evidences')) { photos.set(args[0], { id: args[0], incident_id: args[1], photo_url: args[2] }); return { rows: [] } }
      if (sql.startsWith('UPDATE evidences')) { photos.get(args[1]).photo_url = args[0]; return { rows: [] } }
      if (sql.startsWith('SELECT id, created_at')) return { rows: [...photos.values()].filter(row => row.incident_id === args[0]) }
      if (sql.startsWith('SELECT photo_url') || sql.startsWith('DELETE FROM evidences')) {
        if (args.length === 1) return { rows: [...photos.values()].map(row => ({ ...row })) }
        const row = photos.get(args[0])
        const found = row && row.incident_id === args[1] ? row : null
        const result = found ? [{ ...found }] : []
        if (sql.startsWith('DELETE') && found) photos.delete(args[0])
        return { rows: result }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
    async connect() { return { query: this.query.bind(this), release() {} } },
  }
}

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'incident-photo-test-'))
  t.after(async () => {
    for (const file of await fs.readdir(directory)) await fs.unlink(path.join(directory, file))
    await fs.rmdir(directory)
  })
  const db = database()
  return { service: new LocalIncidentPhotos(db, directory), db, directory }
}

async function image() {
  return sharp({ create: { width: 2100, height: 1100, channels: 3, background: '#4588dd' } }).png().toBuffer()
}

test('photos are real decoded images, optimized to WebP; size, format and pixel limits are enforced', async () => {
  const service = new LocalIncidentPhotos({})
  const result = await service.normalize(await image())
  const metadata = await sharp(result).metadata()
  assert.equal(metadata.format, 'webp')
  assert.equal(metadata.width, 1920)
  assert.ok(result.length <= MAX_BYTES)
  assert.equal(metadata.exif, undefined)
  const padded = Buffer.concat([await image(), Buffer.alloc(MAX_BYTES - (await image()).length)])
  assert.ok((await service.normalize(padded)).length <= MAX_BYTES)
  await assert.rejects(service.normalize(Buffer.alloc(MAX_BYTES + 1)), /2 MB/)
  await assert.rejects(service.normalize(Buffer.from('not a photo')), /válida/)
  await assert.rejects(service.normalize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')), /válida/)
  const huge = await sharp({ create: { width: 6000, height: 6000, channels: 3, background: 'white' } }).png().toBuffer()
  await assert.rejects(service.normalize(huge), /megapíxeles/)
})

test('local save, list, thumbnail, replacement and removal do not store image bytes in the database', async t => {
  const { service, db, directory } = await fixture(t)
  const first = await service.save(incidentId, owner, await image())
  const originalKey = db.photos.get(first.id).photo_url
  assert.match(originalKey, /^local:/)
  assert.equal((await service.list(incidentId, owner)).length, 1)
  const thumbnail = await sharp(await service.read(incidentId, first.id, owner, true)).metadata()
  assert.ok(thumbnail.width <= 360 && thumbnail.height <= 240)
  await service.save(incidentId, owner, await image(), first.id)
  assert.notEqual(db.photos.get(first.id).photo_url, originalKey)
  assert.equal((await fs.readdir(directory)).length, 1)
  await service.delete(incidentId, first.id, owner)
  assert.equal(db.photos.size, 0)
  assert.deepEqual(await fs.readdir(directory), [])
})

test('another citizen cannot read, add, replace, list or delete photos; staff can access', async t => {
  const { service } = await fixture(t)
  const first = await service.save(incidentId, owner, await image())
  const stranger = { userId: 'stranger', role: 'citizen' }
  for (const operation of [
    () => service.list(incidentId, stranger),
    () => service.read(incidentId, first.id, stranger),
    () => service.save(incidentId, stranger, Buffer.from('x')),
    () => service.save(incidentId, stranger, Buffer.from('x'), first.id),
    () => service.delete(incidentId, first.id, stranger),
  ]) await assert.rejects(operation(), /acceso/)
  assert.equal((await service.list(incidentId, { userId: 'staff', role: 'admin' })).length, 1)
  assert.throws(() => service.filePath('local:../../secret'), /encontrada/)
  await assert.rejects(service.read(incidentId, 'invalid', owner), /encontrada/)
})

test('additional photos are supported up to the per-report limit without blocking replacement', async t => {
  const { service } = await fixture(t)
  const bytes = await image()
  let first
  for (let index = 0; index < 10; index++) first = await service.save(incidentId, owner, bytes)
  await assert.rejects(service.save(incidentId, owner, bytes), /10 fotos/)
  await service.save(incidentId, owner, bytes, first.id)
  assert.equal((await service.list(incidentId, owner)).length, 10)
})

test('archive preserves evidence and only staff can read it', async t => {
  const { service, db, directory } = await fixture(t)
  const first = await service.save(incidentId, owner, await image())
  db.archivedAt = new Date()
  const staff = { userId: 'staff', role: 'admin' }
  await assert.rejects(service.read(incidentId, first.id, owner), /no encontrada/)
  await assert.rejects(service.delete(incidentId, first.id, staff), /solo lectura/)
  await assert.rejects(service.save(incidentId, staff, await image()), /solo lectura/)
  assert.equal((await service.list(incidentId, staff)).length, 1)
  assert.ok((await service.read(incidentId, first.id, staff)).length > 0)
  assert.equal(db.photos.size, 1)
  assert.equal((await fs.readdir(directory)).length, 1)
})

test('a database failure during upload cleans up the new file and keeps the previous photo', async t => {
  const { service, db, directory } = await fixture(t)
  const photo = await service.save(incidentId, owner, await image())
  const oldKey = db.photos.get(photo.id).photo_url
  const query = db.query.bind(db)
  db.query = async (sql, args) => {
    if (sql.startsWith('UPDATE evidences')) throw new Error('database failure')
    return query(sql, args)
  }
  await assert.rejects(service.save(incidentId, owner, await image(), photo.id), /database failure/)
  assert.equal(db.photos.get(photo.id).photo_url, oldKey)
  assert.deepEqual(await fs.readdir(directory), [oldKey.slice(6)])
})

test('HTTP photo routes authenticate, return 413 above 2 MiB, and serve private image bytes', async t => {
  const { service } = await fixture(t)
  const app = createApp({
    useCases: {}, photoService: service, frontendOrigins: ['http://localhost'], readinessCheck: async () => {},
    tokenService: { verify: token => ({ userId: token }) },
    userRepository: { findById: async id => ({ id, role: 'citizen' }) },
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const url = `http://127.0.0.1:${server.address().port}/api/incidents/${incidentId}/photos`
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/octet-stream' }
  assert.equal((await fetch(url)).status, 401)
  assert.equal((await fetch(url, { method: 'POST', headers, body: Buffer.alloc(MAX_BYTES + 1) })).status, 413)
  assert.equal((await fetch(url, { method: 'POST', headers, body: Buffer.from('fake') })).status, 400)
  const created = await fetch(url, { method: 'POST', headers, body: await image() })
  assert.equal(created.status, 201)
  const { data } = await created.json()
  const read = await fetch(`${url}/${data.id}`, { headers })
  assert.equal(read.status, 200)
  assert.match(read.headers.get('content-type'), /image\/webp/)
  assert.equal(read.headers.get('cache-control'), 'private, no-store')
  assert.equal((await fetch(`${url}/${data.id}`, { headers: { Authorization: 'Bearer stranger' } })).status, 403)
  assert.equal((await fetch(`${url}/${data.id}`, { method: 'DELETE', headers })).status, 204)
  assert.equal((await fetch(`${url}/${data.id}`, { headers })).status, 404)
})
