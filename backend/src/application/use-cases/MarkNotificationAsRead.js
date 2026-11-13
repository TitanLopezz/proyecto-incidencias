const ForbiddenError = require('../../domain/errors/ForbiddenError')
const NotFoundError = require('../../domain/errors/NotFoundError')
const ValidationError = require('../../domain/errors/ValidationError')

class MarkNotificationAsRead {
  constructor(notificationRepository) {
    this.notificationRepository = notificationRepository
  }

  async execute({ id, userId, role }) {
    if (role !== 'citizen') {
      throw new ForbiddenError('Las notificaciones están disponibles solo para ciudadanos.')
    }

    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new ValidationError('El identificador de la notificación no es válido.')
    }

    const notification = await this.notificationRepository.markAsRead(id, userId)
    if (!notification) {
      throw new NotFoundError('No se encontró la notificación.')
    }

    return notification
  }
}

module.exports = MarkNotificationAsRead
