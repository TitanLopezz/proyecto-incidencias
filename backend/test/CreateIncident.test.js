const test = require('node:test')
const assert = require('node:assert/strict')
const CreateIncident = require('../src/application/use-cases/CreateIncident')
const GetIncidents = require('../src/application/use-cases/GetIncidents')
const UpdateIncident = require('../src/application/use-cases/UpdateIncident')
const ArchiveIncident = require('../src/application/use-cases/ArchiveIncident')
const ValidationError = require('../src/domain/errors/ValidationError')
const NotFoundError = require('../src/domain/errors/NotFoundError')

test('CreateIncident validates and normalizes a report before saving it', async () => {
  let savedIncident
  const useCase = new CreateIncident({
    async create(incident) {
      savedIncident = incident
      return incident
    },
  })

  const result = await useCase.execute({
    title: '  Falla de alumbrado  ',
    description: '  La luminaria no enciende.  ',
    category: 'alumbrado',
    latitude: 16.7528,
    longitude: -93.1152,
  }, 'citizen-1')

  assert.equal(result, savedIncident)
  assert.equal(savedIncident.title, 'Falla de alumbrado')
  assert.equal(savedIncident.description, 'La luminaria no enciende.')
  assert.equal(savedIncident.category, 'alumbrado')
  assert.equal(savedIncident.status, 'abierta')
  assert.equal(savedIncident.createdBy, 'citizen-1')
})

test('CreateIncident rejects an empty title without calling the repository', async () => {
  let repositoryCalled = false
  const useCase = new CreateIncident({
    async create() { repositoryCalled = true },
  })

  assert.throws(
    () => useCase.execute({ title: '  ', description: 'Detalle', category: 'bache' }),
    ValidationError,
  )
  assert.equal(repositoryCalled, false)
})

test('CreateIncident accepts valid coordinates and requires a location', async () => {
  const createIncident = new CreateIncident({
    async create(incident) { return incident },
  })
  const withLocation = await createIncident.execute({
    title: 'Con ubicación',
    description: 'Reporte en el mapa',
    category: 'bache',
    latitude: 16.7528,
    longitude: -93.1152,
  })

  assert.equal(withLocation.latitude, 16.7528)
  assert.equal(withLocation.longitude, -93.1152)
  assert.throws(
    () => createIncident.execute({
      title: 'Sin ubicación',
      description: 'Reporte telefónico',
      category: 'basura',
    }),
    (error) => error instanceof ValidationError && /ubicación es obligatoria/i.test(error.message),
  )
})

test('CreateIncident rejects unpaired, nonnumeric and out-of-range coordinates', async () => {
  const createIncident = new CreateIncident({
    async create() { throw new Error('No debe guardar coordenadas inválidas') },
  })
  const base = { title: 'Reporte', description: 'Detalle', category: 'bache' }

  for (const coordinates of [
    { latitude: 19.4 },
    { longitude: -99.1 },
    { latitude: '19.4', longitude: -99.1 },
    { latitude: 90.1, longitude: -99.1 },
    { latitude: 19.4, longitude: -180.1 },
    { latitude: Number.NaN, longitude: 10 },
    { latitude: 16.7528, longitude: -99.1332 },
    { latitude: 16.3, longitude: -93.1 },
  ]) {
    assert.throws(
      () => createIncident.execute({ ...base, ...coordinates }),
      ValidationError,
    )
  }
})

test('CreateIncident explains when a valid geographic point is outside Tuxtla', () => {
  const createIncident = new CreateIncident({
    async create() { throw new Error('No debe guardar ubicaciones fuera de Tuxtla') },
  })

  assert.throws(
    () => createIncident.execute({
      title: 'Reporte',
      description: 'Detalle',
      category: 'bache',
      latitude: 16.7528,
      longitude: -99.1332,
    }),
    (error) => error instanceof ValidationError
      && /dentro del municipio de Tuxtla Gutiérrez/i.test(error.message),
  )
})

test('CreateIncident rejects a missing or unknown category', () => {
  const createIncident = new CreateIncident({
    async create() { throw new Error('No debe guardar categorías inválidas') },
  })

  assert.throws(
    () => createIncident.execute({ title: 'Reporte', description: 'Detalle' }),
    ValidationError,
  )
  assert.throws(
    () => createIncident.execute({
      title: 'Reporte',
      description: 'Detalle',
      category: 'pavimento',
    }),
    ValidationError,
  )
})

test('GetIncidents returns repository reports with the authenticated identity and role', async () => {
  const incidents = [{ id: 'incident-1', title: 'Falla' }]
  let query
  const getIncidents = new GetIncidents({
    async findAll(input) {
      query = input
      return incidents
    },
  })

  assert.equal(await getIncidents.execute({ userId: 'admin-1', role: 'admin' }), incidents)
  assert.deepEqual(query, { userId: 'admin-1', role: 'admin' })
})

test('UpdateIncident validates status and returns the updated report', async () => {
  let updateArguments
  const updateIncident = new UpdateIncident({
    async update(id, incident, updatedBy) {
      updateArguments = { id, incident, updatedBy }
      return { incident: { id, ...incident, updatedBy }, notification: null }
    },
  })

  const result = await updateIncident.execute({
    id: 'f2e8ea89-6946-4ce0-9b9f-5d6544a663be',
    title: 'Falla resuelta',
    description: 'Se cambió la luminaria.',
    status: 'resuelta',
    updatedBy: 'admin-1',
  })

  assert.equal(result.status, 'resuelta')
  assert.equal(updateArguments.updatedBy, 'admin-1')
  await assert.rejects(
    updateIncident.execute({
      id: 'f2e8ea89-6946-4ce0-9b9f-5d6544a663be',
      title: 'Falla',
      description: 'Detalle',
      status: 'arbitrario',
    }),
    ValidationError,
  )
})

test('UpdateIncident and ArchiveIncident report missing incidents', async () => {
  const updateIncident = new UpdateIncident({
    async update() { return null },
  })
  const archiveIncident = new ArchiveIncident({
    async archive() { return false },
  })
  const id = 'f2e8ea89-6946-4ce0-9b9f-5d6544a663be'

  await assert.rejects(
    updateIncident.execute({ id, title: 'Falla', description: 'Detalle', status: 'abierta' }),
    NotFoundError,
  )
  await assert.rejects(archiveIncident.execute({ id, reason: 'Duplicado', userId: 'admin', role: 'admin' }), NotFoundError)
  await assert.rejects(archiveIncident.execute({ id: 'bad-id', reason: 'Duplicado', userId: 'admin', role: 'admin' }), NotFoundError)
})
