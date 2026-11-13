class NotificationSender {
  async sendToUser() {
    throw new Error('NotificationSender.sendToUser debe ser implementado.')
  }
}

module.exports = NotificationSender
