const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const createApp = require('../src/infrastructure/http/createApp')
const ValidationError = require('../src/domain/errors/ValidationError')

async function startTestServer(readinessCheck = async () => {}) {
  const app = createApp({
    useCases: {
      createIncident: {
        async execute(input, userId) {
          return {
            id: 'incident-1',
            ...input,
            createdBy: userId,
            status: 'abierta',
            category: input.category,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
          }
        },
      },
      listIncidents: {
        async execute(actor) {
          return [{ id: 'incident-1', title: 'Falla', description: 'Detalle', role: actor.role }]
        },
      },
      updateIncident: {
        async execute(input) {
          return {
            id: input.id,
            title: input.title,
            description: input.description,
            status: input.status,
          }
        },
      },
      updateIncidentStatus: {
        async execute(input) {
          if (!['abierta', 'en_proceso', 'resuelta', 'cerrada'].includes(input.status)) {
            throw new ValidationError('El estado de la incidencia no es válido.')
          }

          return {
            id: input.id,
            title: 'Falla',
            description: 'Detalle',
            status: input.status,
            updatedBy: input.userId,
          }
        },
      },
      getIncidentHeatmap: {
        async execute() {
          return [{ lat: 16.7569, lng: -93.1292, weight: 1 }]
        },
      },
      getUserNotifications: {
        async execute(actor) {
          return [{ id: 'f2e8ea89-6946-4ce0-9b9f-5d6544a663be', userId: actor.userId, isRead: false }]
        },
      },
      markNotificationAsRead: {
        async execute(input) {
          return { id: input.id, userId: input.userId, isRead: true }
        },
      },
      archiveIncident: {
        async execute() {},
      },
      registerUser: {
        async execute(input) {
          return { user: { id: 'user-1', email: input.email, role: 'citizen' }, token: 'test-token' }
        },
      },
      loginUser: {
        async execute() {
          return {
            user: { id: 'user-1', email: 'person@example.com', role: 'citizen' },
            token: 'test-token',
          }
        },
      },
      staffLogin: {
        async execute() {
          return { user: { id: 'admin-1', role: 'admin' }, token: 'staff-token' }
        },
      },
      getCurrentUser: {
        async execute(userId) {
          return { id: userId, email: 'person@example.com', role: 'citizen' }
        },
      },
      createAdmin: {
        async execute(input) {
          return { id: 'admin-2', name: input.name, email: input.email, role: 'admin' }
        },
      },
      listAdmins: {
        async execute() {
          return [{ id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' }]
        },
      },
    },
    tokenService: {
      verify(token) {
        const identityByToken = {
          'test-token': 'user-1',
          'staff-token': 'admin-1',
          'superadmin-token': 'superadmin-1',
        }
        if (!identityByToken[token]) {
          const AuthenticationError = require('../src/domain/errors/AuthenticationError')
          throw new AuthenticationError()
        }

        return { userId: identityByToken[token] }
      },
    },
    userRepository: {
      async findById(id) {
        const roleById = {
          'user-1': 'citizen',
          'admin-1': 'admin',
          'superadmin-1': 'superadmin',
        }
        return roleById[id] ? { id, role: roleById[id] } : null
      },
    },
    frontendOrigins: ['http://localhost:5175'],
    readinessCheck,
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()

  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  }
}

function closeServer(context, server) {
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  }))
}

test('POST /api/incidents creates a located report owned by its authenticated citizen', async (context) => {
  const { server, baseUrl } = await startTestServer()
  closeServer(context, server)

  const response = await fetch(`${baseUrl}/api/incidents`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify({
      title: 'Falla',
      description: 'Detalle',
      category: 'bache',
      latitude: 16.7528,
      longitude: -93.1152,
    }),
  })

  assert.equal(response.status, 201)
  const incident = (await response.json()).data
  assert.equal(incident.createdBy, 'user-1')
  assert.equal(incident.latitude, 16.7528)
  assert.equal(incident.longitude, -93.1152)
})

test('GET /api/incidents lists reports for an authenticated user', async (context) => {
  const { server, baseUrl } = await startTestServer()
  closeServer(context, server)

  const response = await fetch(`${baseUrl}/api/incidents`, {
    headers: { authorization: 'Bearer test-token' },
  })

  assert.equal(response.status, 200)
  assert.equal((await response.json()).data[0].role, 'citizen')
})

test('GET and POST /api/incidents reject requests without a JWT', async (context) => {
  const { server, baseUrl } = await startTestServer()
  closeServer(context, server)

  const listResponse = await fetch(`${baseUrl}/api/incidents`)
  const createResponse = await fetch(`${baseUrl}/api/incidents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Falla', description: 'Detalle' }),
  })

  assert.equal(listResponse.status, 401)
  assert.equal(createResponse.status, 401)
})

  test('PATCH /api/incidents/:id/status allows staff, rejects citizens, and requires a token', async (context) => {
    const { server, baseUrl } = await startTestServer()
    closeServer(context, server)
    const endpoint = `${baseUrl}/api/incidents/incident-1/status`
    const loginResponse = await fetch(`${baseUrl}/api/staff/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'Password123' }),
    })
    const { token: staffToken } = (await loginResponse.json()).data
    const staffAuthorization = `Bearer ${staffToken}`
    const citizenLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.com', password: 'Password123' }),
    })
    const { token: citizenToken } = (await citizenLoginResponse.json()).data
    const patchAsCitizen = (options) => fetch(endpoint, {
      ...options,
      headers: { ...options.headers, authorization: `Bearer ${citizenToken}` },
    })
    const patchAsStaff = (options) => fetch(endpoint, {
      ...options,
      headers: { ...options.headers, authorization: staffAuthorization },
    })

    test('GET /api/analytics/heatmap requires staff authentication', async (context) => {
      const { server, baseUrl } = await startTestServer()
      closeServer(context, server)

      const adminResponse = await fetch(`${baseUrl}/api/analytics/heatmap`, {
        headers: { authorization: 'Bearer staff-token' },
      })
      const superAdminResponse = await fetch(`${baseUrl}/api/analytics/heatmap`, {
        headers: { authorization: 'Bearer superadmin-token' },
      })
      const citizenResponse = await fetch(`${baseUrl}/api/analytics/heatmap`, {
        headers: { authorization: 'Bearer test-token' },
      })
      const unauthenticatedResponse = await fetch(`${baseUrl}/api/analytics/heatmap`)

      assert.equal(adminResponse.status, 200)
      assert.deepEqual((await adminResponse.json()).data, [
        { lat: 16.7569, lng: -93.1292, weight: 1 },
      ])
      assert.equal(superAdminResponse.status, 200)
      assert.equal(citizenResponse.status, 403)
      assert.equal(unauthenticatedResponse.status, 401)
    })

    const adminUpdate = await patchAsStaff({
      method: 'PATCH',
      headers: {
        authorization: '******',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'en_proceso' }),
    })
    const superAdminUpdate = await patchAsStaff({
      method: 'PATCH',
      headers: {
        authorization: '******',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'resuelta' }),
    })
    const citizenUpdate = await patchAsCitizen({
      method: 'PATCH',
      headers: {
        authorization: '******',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'cerrada' }),
    })
    const unauthenticatedUpdate = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'cerrada' }),
    })
    const invalidStatus = await patchAsStaff({
      method: 'PATCH',
      headers: {
        authorization: '******',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'invalido' }),
    })

    assert.equal(adminUpdate.status, 200, await adminUpdate.clone().text())
    assert.equal((await adminUpdate.json()).data.status, 'en_proceso')
    assert.equal(superAdminUpdate.status, 200)
    assert.equal((await superAdminUpdate.json()).data.status, 'resuelta')
    assert.equal(citizenUpdate.status, 403)
    assert.equal(unauthenticatedUpdate.status, 401)
    assert.equal(invalidStatus.status, 400)
  })

  test('notification endpoints are citizen-only and require authentication', async (context) => {
    const { server, baseUrl } = await startTestServer()
    closeServer(context, server)
    const notificationId = 'f2e8ea89-6946-4ce0-9b9f-5d6544a663be'

    const citizenNotifications = await fetch(`${baseUrl}/api/notifications`, {
      headers: { authorization: 'Bearer test-token' },
    })
    const staffNotifications = await fetch(`${baseUrl}/api/notifications`, {
      headers: { authorization: 'Bearer staff-token' },
    })
    const unauthenticatedNotifications = await fetch(`${baseUrl}/api/notifications`)
    const markedRead = await fetch(`${baseUrl}/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer test-token' },
    })
    const staffMarkRead = await fetch(`${baseUrl}/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer staff-token' },
    })

    assert.equal(citizenNotifications.status, 200)
    assert.equal((await citizenNotifications.json()).data[0].userId, 'user-1')
    assert.equal(staffNotifications.status, 403)
    assert.equal(unauthenticatedNotifications.status, 401)
    assert.equal(markedRead.status, 200)
    assert.equal((await markedRead.json()).data.isRead, true)
    assert.equal(staffMarkRead.status, 403)
  })

  test('only staff can modify incidents and only superadmins can manage administrator accounts', async (context) => {
  const { server, baseUrl } = await startTestServer()
  closeServer(context, server)

  const citizenUpdate = await fetch(`${baseUrl}/api/incidents/incident-1`, {
    method: 'PUT',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ title: 'Falla', description: 'Detalle', status: 'resuelta' }),
  })
  const adminCreate = await fetch(`${baseUrl}/api/admins`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer staff-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Otro admin',
      email: 'admin2@example.com',
      password: 'Password123',
    }),
  })
  const superAdminCreate = await fetch(`${baseUrl}/api/admins`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer superadmin-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Otro admin',
      email: 'admin2@example.com',
      password: 'Password123',
      role: 'superadmin',
    }),
  })

  assert.equal(citizenUpdate.status, 403)
  assert.equal(adminCreate.status, 403)
  assert.equal(superAdminCreate.status, 201)
  assert.equal((await superAdminCreate.json()).data.role, 'admin')
})

test('staff login is distinct from public citizen login', async (context) => {
  const { server, baseUrl } = await startTestServer()
  closeServer(context, server)

  const response = await fetch(`${baseUrl}/api/staff/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'Password123' }),
  })

  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.user.role, 'admin')
})

test('POST /api/auth/register creates a citizen account', async (context) => {
  const { server, baseUrl } = await startTestServer()
  closeServer(context, server)

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Persona',
      email: 'person@example.com',
      password: 'Password123',
      role: 'superadmin',
    }),
  })

  assert.equal(response.status, 201)
  assert.equal((await response.json()).data.user.role, 'citizen')
})

test('GET /api/auth/me requires a valid Bearer token', async (context) => {
  const { server, baseUrl } = await startTestServer()
  closeServer(context, server)

  const unauthorized = await fetch(`${baseUrl}/api/auth/me`)
  assert.equal(unauthorized.status, 401)

  const authorized = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { authorization: 'Bearer test-token' },
  })
  assert.equal(authorized.status, 200)
  assert.equal((await authorized.json()).data.role, 'citizen')
})

test('GET /ready informs whether PostgreSQL is ready', async (context) => {
  const { server, baseUrl } = await startTestServer()
  closeServer(context, server)

  const response = await fetch(`${baseUrl}/ready`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ready' })
})

test('GET /api/health verifies PostgreSQL and allows the Vite origin', async (context) => {
  const { server, baseUrl } = await startTestServer()
  closeServer(context, server)

  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { origin: 'http://localhost:5175' },
  })

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /application\/json/)
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5175')
  assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' })
})

test('GET /api/health returns JSON 503 when PostgreSQL is unavailable', async (context) => {
  const { server, baseUrl } = await startTestServer(async () => {
    throw new Error('Database unavailable')
  })
  closeServer(context, server)

  const response = await fetch(`${baseUrl}/api/health`)

  assert.equal(response.status, 503)
  assert.match(response.headers.get('content-type'), /application\/json/)
  assert.deepEqual(await response.json(), {
    status: 'not_ready',
    error: { message: 'PostgreSQL no está disponible.' },
  })
})

test('GET /ready responds 503 when PostgreSQL is unavailable', async (context) => {
  const { server, baseUrl } = await startTestServer(async () => {
    throw new Error('Database unavailable')
  })
  closeServer(context, server)

  const response = await fetch(`${baseUrl}/ready`)

  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), {
    status: 'not_ready',
    error: { message: 'Una dependencia necesaria no está disponible.' },
  })
})

test('HTTP errors return JSON for unknown routes and malformed request bodies', async (context) => {
  const { server, baseUrl } = await startTestServer()
  closeServer(context, server)

  const missingRoute = await fetch(`${baseUrl}/api/route-that-does-not-exist`)
  assert.equal(missingRoute.status, 404)
  assert.match(missingRoute.headers.get('content-type'), /application\/json/)
  assert.deepEqual(await missingRoute.json(), {
    error: { message: 'Ruta no encontrada.' },
  })

  const malformedBody = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"email":',
  })
  assert.equal(malformedBody.status, 400)
  assert.match(malformedBody.headers.get('content-type'), /application\/json/)
  assert.deepEqual(await malformedBody.json(), {
    error: { message: 'El cuerpo de la solicitud debe ser JSON válido.' },
  })
})
