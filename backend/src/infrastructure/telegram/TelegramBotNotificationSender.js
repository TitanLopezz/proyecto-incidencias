const TelegramNotificationSender = require('../../domain/ports/TelegramNotificationSender')

class TelegramBotNotificationSender extends TelegramNotificationSender {
  constructor(token, request = fetch) {
    super()
    this.url = `https://api.telegram.org/bot${token}/sendMessage`
    this.request = request
  }

  async send(chatId, text) {
    try {
      const response = await this.request(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      })
      const payload = await response.json()
      if (response.ok && payload.ok === true) return { type: 'sent', result: 'accepted' }
      if (payload.ok === false && response.status === 429) {
        const retryAfter = Number(payload.parameters?.retry_after)
        return {
          type: 'retry', result: 'rate_limited',
          retryAfter: Number.isSafeInteger(retryAfter) && retryAfter > 0 ? retryAfter : 0,
        }
      }
      if (payload.ok === false && [400, 401, 403, 404].includes(response.status)) {
        return { type: 'failed', result: 'rejected' }
      }
      return { type: 'uncertain', result: 'unconfirmed_response' }
    } catch {
      return { type: 'uncertain', result: 'transport_unconfirmed' }
    }
  }
}

module.exports = TelegramBotNotificationSender
