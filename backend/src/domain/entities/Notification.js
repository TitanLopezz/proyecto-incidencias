const ValidationError = require('../errors/ValidationError')

class Notification {
  constructor({ id, userId, incidentId, message, isRead = false, createdAt = new Date() }) {
    this.id = id
    this.userId = userId
    this.incidentId = incidentId
    this.message = message
    this.isRead = isRead
    this.createdAt = createdAt
  }

  static create({ id = null, userId, incidentId, message, isRead = false, createdAt } = {}) {
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new ValidationError('El destinatario de la notificación es obligatorio.')
    }

    if (typeof incidentId !== 'string' || !incidentId.trim()) {
      throw new ValidationError('La incidencia de la notificación es obligatoria.')
    }

    if (typeof message !== 'string' || !message.trim()) {
      throw new ValidationError('El mensaje de la notificación es obligatorio.')
    }

    if (typeof isRead !== 'boolean') {
      throw new ValidationError('El estado de lectura de la notificación no es válido.')
    }

    return new Notification({
      id,
      userId,
      incidentId,
      message: message.trim(),
      isRead,
      createdAt,
    })
  }
}

module.exports = Notification
