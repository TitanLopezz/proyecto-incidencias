const ForbiddenError = require('../../domain/errors/ForbiddenError')

class GetUserNotifications {
  constructor(notificationRepository) {
    this.notificationRepository = notificationRepository
  }

  async execute({ userId, role }) {
    if (role !== 'citizen') {
      throw new ForbiddenError('Las notificaciones están disponibles solo para ciudadanos.')
    }

    return this.notificationRepository.findByUserId(userId)
  }
}

module.exports = GetUserNotifications
