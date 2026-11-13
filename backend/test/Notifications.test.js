const test = require('node:test')
const assert = require('node:assert/strict')
const Notification = require('../src/domain/entities/Notification')
const GetUserNotifications = require('../src/application/use-cases/GetUserNotifications')
const MarkNotificationAsRead = require('../src/application/use-cases/MarkNotificationAsRead')
const ForbiddenError = require('../src/domain/errors/ForbiddenError')
const NotFoundError = require('../src/domain/errors/NotFoundError')
const ValidationError = require('../src/domain/errors/ValidationError')

const notificationId = 'f2e8ea89-6946-4ce0-9b9f-5d6544a663be'
const incidentId = 'f2e8ea89-6946-4ce0-9b9f-5d6544a663bf'

test('Notification validates required data and defaults to unread', () => {
  const notification = Notification.create({
    userId: 'citizen-1',
    incidentId,
    message: 'La incidencia cambió de estado.',
  })

  assert.equal(notification.isRead, false)
  assert.equal(notification.message, 'La incidencia cambió de estado.')
  assert.throws(() => Notification.create({ userId: 'citizen-1', incidentId }), ValidationError)
  assert.throws(() => Notification.create({
    userId: 'citizen-1',
    incidentId,
    message: 'Mensaje',
    isRead: 'false',
  }), ValidationError)
})

test('GetUserNotifications lists only for the authenticated citizen', async () => {
  const notifications = [{ id: notificationId }]
  let queriedUserId
  const useCase = new GetUserNotifications({
    async findByUserId(userId) {
      queriedUserId = userId
      return notifications
    },
  })

  assert.equal(await useCase.execute({ userId: 'citizen-1', role: 'citizen' }), notifications)
  assert.equal(queriedUserId, 'citizen-1')
  await assert.rejects(useCase.execute({ userId: 'admin-1', role: 'admin' }), ForbiddenError)
})

test('MarkNotificationAsRead marks only an owned citizen notification', async () => {
  let argumentsReceived
  const useCase = new MarkNotificationAsRead({
    async markAsRead(...args) {
      argumentsReceived = args
      return { id: args[0], userId: args[1], isRead: true }
    },
  })

  const notification = await useCase.execute({
    id: notificationId,
    userId: 'citizen-1',
    role: 'citizen',
  })

  assert.deepEqual(argumentsReceived, [notificationId, 'citizen-1'])
  assert.equal(notification.isRead, true)
  await assert.rejects(
    useCase.execute({ id: notificationId, userId: 'admin-1', role: 'admin' }),
    ForbiddenError,
  )
})

test('MarkNotificationAsRead rejects invalid IDs and missing or unowned notifications', async () => {
  const useCase = new MarkNotificationAsRead({
    async markAsRead() { return null },
  })

  await assert.rejects(
    useCase.execute({ id: 'invalid', userId: 'citizen-1', role: 'citizen' }),
    ValidationError,
  )
  await assert.rejects(
    useCase.execute({ id: notificationId, userId: 'citizen-1', role: 'citizen' }),
    NotFoundError,
  )
})
