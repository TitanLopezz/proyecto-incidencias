const NotificationSender = require('../../domain/ports/NotificationSender')

class SocketNotificationSender extends NotificationSender {
  constructor() {
    super()
    this.io = null
  }

  attach(io) {
    if (this.io) {
      throw new Error('SocketNotificationSender ya está conectado a un servidor.')
    }
    this.io = io
  }

  async sendToUser(userId, notification, incident) {
    if (!this.io) {
      throw new Error('SocketNotificationSender no está conectado a un servidor.')
    }

    this.io.to(`user:${userId}`).emit('new_notification', notification)
    if (incident) {
      const { id, status, updatedAt } = incident
      this.io.to(`user:${userId}`).emit('incident_status_updated', { id, status, updatedAt })
    }
  }
}

module.exports = SocketNotificationSender
