const test = require('node:test')
const assert = require('node:assert/strict')
const IncidentAssignmentPolicy = require('../src/domain/services/IncidentAssignmentPolicy')

test('deadlines start at reception and supervision respects the configured delay', () => {
  const policy = new IncidentAssignmentPolicy({ dueHours: 48, escalationHours: 6 })
  const item = { status: 'abierta', receivedAt: '2026-11-01T12:00:00Z', contactAvailable: false }
  const before = policy.describe(item, new Date('2026-11-03T11:59:59Z'))
  assert.equal(before.dueAt.toISOString(), '2026-11-03T12:00:00.000Z')
  assert.equal(before.needsAssignment, true)
  assert.equal(before.overdue, false)
  const due = policy.describe(item, new Date('2026-11-03T12:00:00Z'))
  assert.equal(due.overdue, true)
  assert.equal(due.escalated, false)
  const escalated = policy.describe(item, new Date('2026-11-03T18:00:00Z'))
  assert.equal(escalated.escalated, true)
})

test('completed cases stop escalating and assigned deadlines stay fixed', () => {
  const policy = new IncidentAssignmentPolicy({ dueHours: 24, escalationHours: 0 })
  const dueAt = new Date('2026-11-05T12:00:00Z')
  const item = { status: 'cerrada', receivedAt: '2026-11-01T12:00:00Z', dueAt, contactAvailable: false }
  const result = policy.describe(item, new Date('2026-11-06T12:00:00Z'))
  assert.equal(result.dueAt, dueAt)
  assert.equal(result.needsAssignment, false)
  assert.equal(result.overdue, false)
  assert.equal(result.escalated, false)
})
