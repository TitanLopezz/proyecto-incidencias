const { telegramNotice } = require('../../domain/services/IncidentStatusNotice')

class DeliverTelegramNotification {
  constructor({ outbox, sender }) {
    Object.assign(this, { outbox, sender })
  }

  async execute() {
    const item = await this.outbox.claim()
    if (!item) return false
    const chatId = await this.outbox.findRecipient(item)
    if (!chatId) {
      await this.outbox.finish(item, { state: 'cancelled', result: 'no_consent' })
      return true
    }
    const outcome = await this.sender.send(chatId, telegramNotice(item))
    if (outcome.type === 'retry') {
      const retrySeconds = Math.max(30 * 2 ** (item.attempts - 1), outcome.retryAfter ?? 0)
      const canRetry = item.attempts < 5 && retrySeconds <= 86400
      await this.outbox.finish(item, canRetry
        ? { state: 'pending', result: outcome.result, retrySeconds }
        : { state: 'failed', result: 'retry_limit' })
    } else {
      await this.outbox.finish(item, { state: outcome.type, result: outcome.result })
    }
    return true
  }
}

module.exports = DeliverTelegramNotification
