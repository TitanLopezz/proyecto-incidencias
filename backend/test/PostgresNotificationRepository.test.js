const test = require('node:test')
const assert = require('node:assert/strict')
const PostgresNotificationRepository = require('../src/infrastructure/persistence/PostgresNotificationRepository')

function row(overrides = {}) {
  return {
    id: 'f2e8ea89-6946-4ce0-9b9f-5d6544a663be',
    user_id: 'f2e8ea89-6946-4ce0-9b9f-5d6544a663bf',
    incident_id: 'f2e8ea89-6946-4ce0-9b9f-5d6544a663c0',
    message: 'El estado cambió.',
    is_read: false,
    created_at: new Date(),
    ...overrides,
  }
}

test('PostgresNotificationRepository creates and maps notifications', async () => {
  let queryArguments
  const repository = new PostgresNotificationRepository({
    async query(sql, parameters) {
      queryArguments = { sql, parameters }
      return { rows: [row()] }
    },
  })

  const notification = await repository.create({
    userId: row().user_id,
    incidentId: row().incident_id,
    message: 'El estado cambió.',
    isRead: false,
  })

  assert.match(queryArguments.sql, /INSERT INTO notifications/)
  assert.deepEqual(queryArguments.parameters, [
    row().user_id,
    row().incident_id,
    'El estado cambió.',
    false,
    null,
  ])
  assert.equal(notification.id, row().id)
  assert.equal(notification.isRead, false)
})

test('PostgresNotificationRepository lists notifications for one user, newest first', async () => {
  let queryArguments
  const repository = new PostgresNotificationRepository({
    async query(sql, parameters) {
      queryArguments = { sql, parameters }
      return { rows: [row(), row({ is_read: true })] }
    },
  })

  const notifications = await repository.findByUserId(row().user_id)

  assert.match(queryArguments.sql, /WHERE user_id = \$1/)
  assert.match(queryArguments.sql, /ORDER BY created_at DESC, id DESC/)
  assert.deepEqual(queryArguments.parameters, [row().user_id])
  assert.equal(notifications.length, 2)
  assert.equal(notifications[1].isRead, true)
})

test('PostgresNotificationRepository marks read only for the owning user', async () => {
  let queryArguments
  const repository = new PostgresNotificationRepository({
    async query(sql, parameters) {
      queryArguments = { sql, parameters }
      return { rows: [row({ is_read: true })] }
    },
  })

  const notification = await repository.markAsRead(row().id, row().user_id)

  assert.match(queryArguments.sql, /WHERE id = \$1 AND user_id = \$2/)
  assert.deepEqual(queryArguments.parameters, [row().id, row().user_id])
  assert.equal(notification.isRead, true)
})

test('PostgresNotificationRepository returns null for missing or unowned notifications', async () => {
  const repository = new PostgresNotificationRepository({
    async query() { return { rows: [] } },
  })

  assert.equal(await repository.markAsRead(row().id, 'other-user'), null)
})
