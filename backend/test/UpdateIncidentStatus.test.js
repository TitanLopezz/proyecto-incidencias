const test = require('node:test')
const assert = require('node:assert/strict')
const UpdateIncidentStatus = require('../src/application/use-cases/UpdateIncidentStatus')
const ForbiddenError = require('../src/domain/errors/ForbiddenError')
const NotFoundError = require('../src/domain/errors/NotFoundError')
const ValidationError = require('../src/domain/errors/ValidationError')

const incidentId = 'f2e8ea89-6946-4ce0-9b9f-5d6544a663be'

test('UpdateIncidentStatus updates the status and records the staff actor', async () => {
  let argumentsReceived
  const useCase = new UpdateIncidentStatus({
    async updateStatus(...args) {
      argumentsReceived = args
      return { incident: { id: args[0], status: args[1], updatedBy: args[2] }, notification: null }
    },
  })

  const incident = await useCase.execute({
    id: incidentId,
    status: 'en_proceso',
    userId: 'admin-1',
    role: 'admin',
  })

  assert.deepEqual(argumentsReceived, [incidentId, 'en_proceso', 'admin-1'])
  assert.equal(incident.status, 'en_proceso')
  assert.equal(incident.updatedBy, 'admin-1')
})

test('UpdateIncidentStatus emits the committed notice and tolerates a Socket.IO failure', async () => {
  const notification = { id: 'notification-1' }
  const incident = { id: incidentId, status: 'en_proceso', createdBy: 'citizen-1' }
  const calls = []
  const useCase = new UpdateIncidentStatus({
    async updateStatus() {
      calls.push('committed')
      return { incident, notification }
    },
  }, {
    async sendToUser(...args) {
      calls.push(args)
      throw new Error('socket unavailable')
    },
  })
  const result = await useCase.execute({ id: incidentId, status: 'en_proceso', userId: 'admin-1', role: 'admin' })
  assert.equal(result, incident)
  assert.deepEqual(calls, ['committed', ['citizen-1', notification, incident]])
})

test('UpdateIncidentStatus does not notify when the update fails or incident has no owner', async () => {
  let notificationCalled = false
  const notificationSender = {
    async sendToUser() { notificationCalled = true },
  }
  const missingIncidentUseCase = new UpdateIncidentStatus({
    async updateStatus() { return null },
  }, notificationSender)
  const ownerlessIncidentUseCase = new UpdateIncidentStatus({
    async updateStatus() {
      return { incident: { id: incidentId, status: 'abierta', createdBy: null }, notification: null }
    },
  }, notificationSender)

  await assert.rejects(
    missingIncidentUseCase.execute({
      id: incidentId,
      status: 'resuelta',
      userId: 'admin-1',
      role: 'admin',
    }),
    NotFoundError,
  )
  await ownerlessIncidentUseCase.execute({
    id: incidentId,
    status: 'abierta',
    userId: 'admin-1',
    role: 'admin',
  })
  assert.equal(notificationCalled, false)
})

test('UpdateIncidentStatus allows superadmins and rejects citizens', async () => {
  let repositoryCalled = false
  const useCase = new UpdateIncidentStatus({
    async updateStatus() {
      repositoryCalled = true
      return { incident: { id: incidentId, status: 'resuelta' }, notification: null }
    },
  })

  await useCase.execute({
    id: incidentId,
    status: 'resuelta',
    userId: 'superadmin-1',
    role: 'superadmin',
  })
  assert.equal(repositoryCalled, true)

  await assert.rejects(
    useCase.execute({
      id: incidentId,
      status: 'resuelta',
      userId: 'citizen-1',
      role: 'citizen',
    }),
    ForbiddenError,
  )
})

test('UpdateIncidentStatus rejects invalid IDs and statuses without repository calls', async () => {
  let repositoryCalled = false
  const useCase = new UpdateIncidentStatus({
    async updateStatus() {
      repositoryCalled = true
    },
  })

  await assert.rejects(
    useCase.execute({ id: 'invalid-id', status: 'abierta', userId: 'admin-1', role: 'admin' }),
    NotFoundError,
  )
  await assert.rejects(
    useCase.execute({ id: incidentId, status: 'invalid', userId: 'admin-1', role: 'admin' }),
    ValidationError,
  )
  assert.equal(repositoryCalled, false)
})

test('UpdateIncidentStatus reports a missing incident', async () => {
  const useCase = new UpdateIncidentStatus({
    async updateStatus() { return null },
  })

  await assert.rejects(
    useCase.execute({ id: incidentId, status: 'cerrada', userId: 'admin-1', role: 'admin' }),
    NotFoundError,
  )
})
