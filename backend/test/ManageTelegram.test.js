const test = require('node:test')
const assert = require('node:assert/strict')
const ManageTelegram = require('../src/application/use-cases/ManageTelegram')
const ForbiddenError = require('../src/domain/errors/ForbiddenError')
const NotFoundError = require('../src/domain/errors/NotFoundError')
const ValidationError = require('../src/domain/errors/ValidationError')

test('Telegram redeems a code once and scopes all report actions to the linked citizen', async () => {
  const code = 'A'.repeat(43)
  const folio = 'dad34b59-6521-4293-9d6a-b28a17af28e4'
  const otherFolio = '7f49948b-240c-4768-86b6-fbaae38b73e5'
  const pending = new Map()
  const linked = new Map()
  const bot = new ManageTelegram({
    codes: { issue: () => code, hash: value => 'hash:' + value },
    links: {
      storeCode: (userId, hash) => pending.set(hash, userId),
      redeem(hash, chatId) {
        if (!pending.has(hash)) return false
        linked.set(chatId, pending.get(hash))
        return pending.delete(hash)
      },
      findCitizen: chatId => linked.get(chatId),
      unlink: () => linked.delete('123'),
    },
    createIncident: {
      execute(input, userId) {
        assert.equal(userId, 'citizen-1')
        assert.equal(input.title, 'Prueba')
        return { id: folio }
      },
    },
    listIncidents: {
      execute(identity) {
        assert.deepEqual(identity, { userId: 'citizen-1', role: 'citizen' })
        return [{ id: folio, title: 'Prueba', status: 'abierta', reporter: { email: 'privado@example.test' } }]
      },
    },
  })
  const request = (action, fields = {}) => bot.execute({ chatId: '123', action, ...fields })
  await assert.rejects(request('recent'), ForbiddenError)
  assert.deepEqual(await bot.createLink('citizen-1'), { code })
  assert.deepEqual(await request('link', { code }), { linked: true })
  await assert.rejects(bot.execute({ chatId: '124', action: 'link', code }), ValidationError)
  await assert.rejects(request('status', { folio: otherFolio }), NotFoundError)
  const [report] = await request('recent')
  assert.equal(report.id, folio)
  assert.equal(Object.hasOwn(report, 'reporter'), false)
  assert.deepEqual(await request('create', { incident: { title: 'Prueba' } }), { id: folio })
  await bot.unlink('citizen-1')
  await assert.rejects(request('recent'), ForbiddenError)
})

test('Telegram notices default to disabled and can be enabled only for a linked account with delivery available', async () => {
  let linked = false
  const links = {
    async getPreference() { return { linked, enabled: false } },
    async setPreference(userId, enabled) {
      assert.equal(userId, 'citizen-1')
      return linked ? { linked, enabled } : null
    },
  }
  const enabled = new ManageTelegram({ links, notificationsAvailable: true })
  assert.deepEqual(await enabled.getPreference('citizen-1'), { linked: false, enabled: false, available: true })
  await assert.rejects(enabled.setPreference('citizen-1', true), /Vincula/)
  linked = true
  assert.equal((await enabled.setPreference('citizen-1', true)).enabled, true)
  assert.equal((await enabled.setPreference('citizen-1', false)).enabled, false)
  const disabled = new ManageTelegram({ links })
  await assert.rejects(disabled.setPreference('citizen-1', true), /disponible/)
})
