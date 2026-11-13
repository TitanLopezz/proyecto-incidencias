const test = require('node:test')
const assert = require('node:assert/strict')
const createTeamController = require('../src/infrastructure/http/controllers/TeamController')
const ManageTeam = require('../src/application/use-cases/ManageTeam')
const ValidationError = require('../src/domain/errors/ValidationError')

const CONTACT_ID = 'e15116b4-f663-4a78-9d17-4f8dcb54e929'
const INCIDENT_ID = '9abbe3e6-1260-45ed-a66b-820f5500db88'

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

function createRepository(overrides = {}) {
  return {
    async listContactos() { return [{ id: CONTACT_ID }] },
    async createContacto(contacto) { return { id: CONTACT_ID, ...contacto } },
    async updateContacto(id, contacto) { return { id, ...contacto } },
    async deleteContacto() { return true },
    async findContactoById() {
      return { id: CONTACT_ID, nombre: 'Ana', equipo: 'Cuadrilla', telefono: '+526641234567', activo: true }
    },
    async findIncidentById() { return { id: INCIDENT_ID } },
    async createLlamada(llamada) { return { id: 1, ...llamada } },
    async listLlamadas() { return [] },
    ...overrides,
  }
}

test('contact CRUD returns consistent JSON data and validates submitted fields', async () => {
  const controller = createTeamController(new ManageTeam(createRepository()))
  const response = createResponse()

  await controller.listContactos({ query: { activos: 'true' } }, response)
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body.data, [{ id: CONTACT_ID }])

  const createdResponse = createResponse()
  await controller.createContacto({
    body: {
      nombre: 'Ana',
      equipo: 'Cuadrilla',
      tipo_incidencia: 'bache',
      telefono: '+526641234567',
      activo: true,
    },
  }, createdResponse)
  assert.equal(createdResponse.statusCode, 201)
  assert.equal(createdResponse.body.data.nombre, 'Ana')

  await assert.rejects(
    controller.createContacto({
      body: { nombre: 'Ana', equipo: 'Cuadrilla', telefono: '123', activo: true },
    }, createResponse()),
    ValidationError,
  )

  const updatedResponse = createResponse()
  await controller.updateContacto({
    params: { id: CONTACT_ID },
    body: { nombre: 'Ana M.', equipo: 'Cuadrilla', telefono: '+526641234567', activo: false },
  }, updatedResponse)
  assert.equal(updatedResponse.statusCode, 200)
  assert.equal(updatedResponse.body.data.activo, false)

  const deletedResponse = createResponse()
  await controller.deleteContacto({ params: { id: CONTACT_ID } }, deletedResponse)
  assert.deepEqual(deletedResponse.body, { data: { id: CONTACT_ID, eliminado: true } })
})

test('call history requires valid active records and captures the authenticated administrator', async () => {
  let savedCall
  const controller = createTeamController(new ManageTeam(createRepository({
    async createLlamada(call) {
      savedCall = call
      return { id: 1, ...call }
    },
  })))
  const response = createResponse()

  await controller.createLlamada({
    auth: { userId: 'admin-1' },
    body: { incident_id: INCIDENT_ID, contacto_id: CONTACT_ID, canal: 'whatsapp' },
  }, response)
  assert.equal(response.statusCode, 201)
  assert.equal(savedCall.admin_id, 'admin-1')
  assert.equal(savedCall.incident_id, INCIDENT_ID)
  assert.equal(response.body.data.canal, 'whatsapp')

  const inactiveController = createTeamController(new ManageTeam(createRepository({
    async findContactoById() { return { id: CONTACT_ID, activo: false } },
  })))
  await assert.rejects(
    inactiveController.createLlamada({
      auth: { userId: 'admin-1' },
      body: { contacto_id: CONTACT_ID, canal: 'telefono' },
    }, createResponse()),
    ValidationError,
  )
})
