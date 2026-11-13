class TelegramNotificationOutbox {
  async claim() { throw new Error('TelegramNotificationOutbox.claim debe ser implementado.') }
  async findRecipient() { throw new Error('TelegramNotificationOutbox.findRecipient debe ser implementado.') }
  async finish() { throw new Error('TelegramNotificationOutbox.finish debe ser implementado.') }
}

module.exports = TelegramNotificationOutbox
