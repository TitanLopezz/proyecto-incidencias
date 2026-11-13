const test = require('node:test')
const assert = require('node:assert/strict')
const DeliverTelegramNotification = require('../src/application/use-cases/DeliverTelegramNotification')
const TelegramBotNotificationSender = require('../src/infrastructure/telegram/TelegramBotNotificationSender')

function fixture({ attempts = 1, chatId = '42', outcome }) {
  const item = { transitionId: '5', incidentId: 'folio-1', status: 'resuelta', attempts }
  const calls = []
  const delivery = new DeliverTelegramNotification({
    outbox: {
      claim: async () => item,
      findRecipient: async () => chatId,
      async finish(job, result) { calls.push({ job, result }) },
    },
    sender: { async send(...args) { calls.push(args); return outcome } },
  })
  return { calls, delivery, item }
}

test('the worker respects provider delays, caps retries and sends only folio and status', async () => {
  const outcome = { type: 'retry', result: 'rate_limited', retryAfter: 90 }
  const { calls, delivery, item } = fixture({ outcome })
  await delivery.execute()
  assert.deepEqual(calls, [
    ['42', 'Folio: folio-1\nEstado: Resuelta'],
    { job: item, result: { state: 'pending', result: 'rate_limited', retrySeconds: 90 } },
  ])
  const exhausted = fixture({ attempts: 5, outcome })
  await exhausted.delivery.execute()
  assert.deepEqual(exhausted.calls[1].result, { state: 'failed', result: 'retry_limit' })
})

test('the worker cancels revoked recipients and does not retry ambiguous delivery', async () => {
  const revoked = fixture({ chatId: null })
  await revoked.delivery.execute()
  assert.deepEqual(revoked.calls, [{ job: revoked.item, result: { state: 'cancelled', result: 'no_consent' } }])
  const unclear = fixture({ outcome: { type: 'uncertain', result: 'transport_unconfirmed' } })
  await unclear.delivery.execute()
  assert.deepEqual(unclear.calls[1].result, { state: 'uncertain', result: 'transport_unconfirmed' })
})

test('the Telegram adapter distinguishes rejection, rate limits and unconfirmed responses', async () => {
  for (const [status, body, expected] of [
    [200, { ok: true }, { type: 'sent', result: 'accepted' }],
    [429, { ok: false, parameters: { retry_after: 10 } }, { type: 'retry', result: 'rate_limited', retryAfter: 10 }],
    [403, { ok: false }, { type: 'failed', result: 'rejected' }],
    [502, { ok: false }, { type: 'uncertain', result: 'unconfirmed_response' }],
  ]) {
    const sender = new TelegramBotNotificationSender('test', async () => Response.json(body, { status }))
    assert.deepEqual(await sender.send('42', 'Folio: folio-1'), expected)
  }
  const sender = new TelegramBotNotificationSender('test', async () => { throw new Error('connection lost') })
  assert.deepEqual(await sender.send('42', 'Folio: folio-1'), { type: 'uncertain', result: 'transport_unconfirmed' })
})
