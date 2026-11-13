const test = require('node:test')
const assert = require('node:assert/strict')
const PostgresIncidentRepository = require('../src/infrastructure/persistence/PostgresIncidentRepository')

test('PostgresIncidentRepository inserts longitude as X and latitude as Y with SRID 4326', async () => {
  let queryArguments
  const repository = new PostgresIncidentRepository({
    async query(sql, parameters) {
      queryArguments = { sql, parameters }
      return {
        rows: [{
          id: 'incident-1',
          title: 'Punto',
          description: 'Detalle',
          category_code: 'bache',
          category_name: 'Bache',
          status: 'abierta',
          created_by: 'citizen-1',
          created_at: new Date(),
          latitude: '19.4326',
          longitude: '-99.1332',
          reporter_name: 'Ciudadana',
          reporter_email: 'citizen@example.com',
        }],
      }
    },
  })

  const incident = await repository.create({
    title: 'Punto',
    description: 'Detalle',
    category: 'bache',
    status: 'abierta',
    createdBy: 'citizen-1',
    latitude: 19.4326,
    longitude: -99.1332,
  })

  assert.match(queryArguments.sql, /ST_SetSRID\(ST_MakePoint/)
  assert.match(queryArguments.sql, /4326/)
  assert.deepEqual(queryArguments.parameters, [
    'Punto',
    'Detalle',
    'bache',
    'abierta',
    'citizen-1',
    19.4326,
    -99.1332,
  ])
  assert.equal(incident.latitude, 19.4326)
  assert.equal(incident.longitude, -99.1332)
  assert.equal(incident.category, 'bache')
  assert.equal(incident.categoryName, 'Bache')
})

test('PostgresIncidentRepository reads coordinates from PostGIS as latitude and longitude', async () => {
  let queryArguments
  const repository = new PostgresIncidentRepository({
    async query(sql, parameters) {
      queryArguments = { sql, parameters }
      return {
        rows: [{
          id: 'incident-1',
          title: 'Punto',
          description: 'Detalle',
          category_code: 'bache',
          category_name: 'Bache',
          status: 'abierta',
          created_by: 'citizen-1',
          created_at: new Date(),
          latitude: '19.4326',
          longitude: '-99.1332',
          reporter_name: 'Ciudadana',
          reporter_email: 'citizen@example.com',
        }],
      }
    },
  })

  const [incident] = await repository.findAll({ userId: 'citizen-1', role: 'citizen' })

  assert.match(queryArguments.sql, /ST_Y\(incidents\.location\) AS latitude/)
  assert.match(queryArguments.sql, /ST_X\(incidents\.location\) AS longitude/)
  assert.match(queryArguments.sql, /LEFT JOIN categories/)
  assert.deepEqual(queryArguments.parameters, ['citizen-1', 'citizen'])
  assert.equal(incident.latitude, 19.4326)
  assert.equal(incident.longitude, -99.1332)
})

test('PostgresIncidentRepository preserves reports without a location', async () => {
  const repository = new PostgresIncidentRepository({
    async query() {
      return {
        rows: [{
          id: 'incident-1',
          title: 'Sin ubicación',
          description: 'Detalle',
          category_code: null,
          status: 'abierta',
          created_by: null,
          created_at: new Date(),
          latitude: null,
          longitude: null,
        }],
      }
    },
  })

  const [incident] = await repository.findAll({ userId: 'citizen-1', role: 'admin' })
  assert.equal(incident.latitude, null)
  assert.equal(incident.longitude, null)
})

function transitionFixture({ previousStatus = 'abierta', failNotice = false } = {}) {
  const queries = []
  const client = {
    async query(sql, parameters = []) {
      queries.push({ sql, parameters })
      if (sql.includes('SELECT status FROM incidents')) return { rows: [{ status: previousStatus }] }
      if (sql.includes('SELECT incidents.*')) return { rows: [{
        id: 'incident-1', title: 'Falla', status: 'en_proceso', created_by: 'citizen-1',
        updated_by: 'admin-1', category_name: 'Bache', latitude: '19.4326', longitude: '-99.1332',
      }] }
      if (sql.includes('INSERT INTO incident_status_history')) return { rows: [{ id: '42' }] }
      return { rows: [] }
    },
    release() { queries.push({ sql: 'RELEASE' }) },
  }
  const notices = {
    async create(notification, options) {
      assert.equal(options.client, client)
      assert.equal(options.transitionId, '42')
      queries.push({ sql: 'NOTICE' })
      if (failNotice) throw new Error('notice failure')
      return { ...notification, id: 'notification-1' }
    },
  }
  return { queries, repository: new PostgresIncidentRepository({ async connect() { return client } }, notices) }
}

test('both update paths persist one history, web notice and outbox entry before commit', async () => {
  for (const edit of [false, true]) {
    const { repository, queries } = transitionFixture()
    const result = edit
      ? await repository.update('incident-1', { title: 'Falla', description: 'Detalle', status: 'en_proceso' }, 'admin-1')
      : await repository.updateStatus('incident-1', 'en_proceso', 'admin-1')
    assert.equal(result.incident.status, 'en_proceso')
    assert.equal(result.incident.categoryName, 'Bache')
    assert.equal(result.incident.latitude, 19.4326)
    assert.equal(result.notification.userId, 'citizen-1')
    const history = queries.findIndex(({ sql }) => sql.includes('INSERT INTO incident_status_history'))
    assert.deepEqual(queries[history].parameters, ['incident-1', 'abierta', 'en_proceso', 'admin-1'])
    assert.equal(queries[history + 1].sql, 'NOTICE')
    assert.match(queries[history + 2].sql, /INSERT INTO telegram_notification_outbox/)
    assert.equal(queries[history + 3].sql, 'COMMIT')
    assert.equal(queries.at(-1).sql, 'RELEASE')
  }
})

test('same-status retry has no history or notification and a title-only edit still saves details', async () => {
  for (const edit of [false, true]) {
    const { repository, queries } = transitionFixture({ previousStatus: 'en_proceso' })
    const result = edit
      ? await repository.update('incident-1', { title: 'Nueva falla', description: 'Detalle', status: 'en_proceso' }, 'admin-1')
      : await repository.updateStatus('incident-1', 'en_proceso', 'admin-1')
    assert.equal(result.notification, null)
    assert.equal(queries.some(({ sql }) => sql.startsWith('UPDATE incidents')), edit)
    assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO')), false)
  }
})

test('invalid transitions and failure to persist a notice roll back the transaction', async () => {
  const invalid = transitionFixture()
  await assert.rejects(invalid.repository.updateStatus('incident-1', 'resuelta', 'admin-1'), /No se permite cambiar el estado/)
  assert.equal(invalid.queries.some(({ sql }) => sql.startsWith('UPDATE incidents')), false)
  assert.equal(invalid.queries.at(-2).sql, 'ROLLBACK')

  const failure = transitionFixture({ failNotice: true })
  await assert.rejects(failure.repository.updateStatus('incident-1', 'en_proceso', 'admin-1'), /notice failure/)
  assert.equal(failure.queries.at(-2).sql, 'ROLLBACK')
  assert.equal(failure.queries.some(({ sql }) => sql === 'COMMIT'), false)
})

test('PostgresIncidentRepository returns only located incidents as weighted heatmap coordinates', async () => {
  let queryArguments
  const repository = new PostgresIncidentRepository({
    async query(sql, parameters) {
      queryArguments = { sql, parameters }
      return {
        rows: [
          { lat: '16.7569', lng: '-93.1292', weight: '1.0' },
          { lat: '16.75', lng: '-93.12', weight: '0.5' },
        ],
      }
    },
  })

  const points = await repository.getHeatmapData()

  assert.match(queryArguments.sql, /ST_Y\(location\) AS lat/)
  assert.match(queryArguments.sql, /ST_X\(location\) AS lng/)
  assert.match(queryArguments.sql, /WHERE archived_at IS NULL AND location IS NOT NULL/)
  assert.match(queryArguments.sql, /CASE status/)
  assert.equal(queryArguments.parameters, undefined)
  assert.deepEqual(points, [
    { lat: 16.7569, lng: -93.1292, weight: 1 },
    { lat: 16.75, lng: -93.12, weight: 0.5 },
  ])
})
