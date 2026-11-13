const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const createApp = require('../src/infrastructure/http/createApp')
const ManageTeam = require('../src/application/use-cases/ManageTeam')
const PostgresTeamRepository = require('../src/infrastructure/persistence/PostgresTeamRepository')

const CONTACT_ID = 'e15116b4-f663-4a78-9d17-4f8dcb54e929'

function contactRow() {
  return {
    id: CONTACT_ID,
    nombre: 'Ana García',
    equipo: 'Cuadrilla de bacheo',
    tipo_incidencia: 'bache',
    tipo_incidencia_nombre: 'Bache',
    telefono: '+526641234567',
    correo: null,
    horario: null,
    activo: true,
    created_at: new Date('2026-01-01T12:00:00Z'),
    updated_at: new Date('2026-01-01T12:00:00Z'),
  }
}

function callRow() {
  return {
    id: 9,
    incident_id: null,
    canal: 'telefono',
    notas: null,
    created_at: new Date('2026-01-01T12:00:00Z'),
    contacto_id: CONTACT_ID,
    contacto_nombre: 'Ana García',
    contacto_equipo: 'Cuadrilla de bacheo',
    contacto_telefono: '+526641234567',
    admin_id: 'admin-1',
    admin_nombre: 'Administradora',
  }
}

test('team REST endpoints require staff auth and support contact and call history operations', async (context) => {
  const database = {
    async query(sql) {
      if (sql.includes('WITH created AS') || sql.includes('WITH updated AS')) {
        return { rows: [contactRow()], rowCount: 1 }
      }
      if (sql.includes('DELETE FROM contactos_equipo')) {
        return { rows: [{ id: CONTACT_ID }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO llamadas_equipo')) {
        return { rows: [{ id: 9 }], rowCount: 1 }
      }
      if (sql.includes('FROM llamadas_equipo l')) {
        return { rows: [callRow()], rowCount: 1 }
      }
      if (sql.includes('FROM contactos_equipo c')) {
        return { rows: [contactRow()], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    },
  }

  const app = createApp({
    useCases: { team: new ManageTeam(new PostgresTeamRepository(database)) },
    tokenService: {
      verify(token) {
        if (token === 'admin-token') return { userId: 'admin-1' }
        if (token === 'citizen-token') return { userId: 'citizen-1' }
        throw new Error('Unexpected token')
      },
    },
    userRepository: {
      async findById(id) {
        return { id, role: id === 'admin-1' ? 'admin' : 'citizen' }
      },
    },
    frontendOrigins: ['http://localhost:5175'],
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}/api`
  const request = (path, options = {}) => fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
  })

  assert.equal((await request('/contactos')).status, 401)
  assert.equal((await request('/contactos', { token: 'citizen-token' })).status, 403)

  const list = await request('/contactos', { token: 'admin-token' })
  assert.equal(list.status, 200)
  assert.equal((await list.json()).data[0].tipoIncidenciaNombre, 'Bache')

  const create = await request('/contactos', {
    token: 'admin-token',
    method: 'POST',
    body: JSON.stringify({
      nombre: 'Ana García',
      equipo: 'Cuadrilla de bacheo',
      tipo_incidencia: 'bache',
      telefono: '+526641234567',
    }),
  })
  assert.equal(create.status, 201)
  assert.equal((await create.json()).data.tipoIncidenciaNombre, 'Bache')

  const update = await request(`/contactos/${CONTACT_ID}`, {
    token: 'admin-token',
    method: 'PUT',
    body: JSON.stringify({
      nombre: 'Ana García',
      equipo: 'Cuadrilla norte',
      tipo_incidencia: 'bache',
      telefono: '+526641234567',
    }),
  })
  assert.equal(update.status, 200)
  assert.equal((await update.json()).data.equipo, 'Cuadrilla de bacheo')

  const invalid = await request('/contactos', {
    token: 'admin-token',
    method: 'POST',
    body: JSON.stringify({
      nombre: 'Ana García',
      equipo: 'Cuadrilla',
      telefono: '123',
    }),
  })
  assert.equal(invalid.status, 400)
  assert.equal(typeof (await invalid.json()).error.message, 'string')

  const call = await request('/llamadas', {
    token: 'admin-token',
    method: 'POST',
    body: JSON.stringify({ contacto_id: CONTACT_ID, canal: 'telefono' }),
  })
  assert.equal(call.status, 201)
  assert.equal((await call.json()).data.admin.nombre, 'Administradora')

  const history = await request('/llamadas', { token: 'admin-token' })
  assert.equal(history.status, 200)
  assert.equal((await history.json()).data[0].contacto.nombre, 'Ana García')

  const deletion = await request(`/contactos/${CONTACT_ID}`, {
    token: 'admin-token',
    method: 'DELETE',
  })
  assert.equal(deletion.status, 200)
  assert.equal((await deletion.json()).data.eliminado, true)
})
