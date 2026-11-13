class NotificationRepository {
  async create() {
    throw new Error('NotificationRepository.create debe ser implementado.')
  }

  async findByUserId() {
    throw new Error('NotificationRepository.findByUserId debe ser implementado.')
  }

  async markAsRead() {
    throw new Error('NotificationRepository.markAsRead debe ser implementado.')
  }
}

module.exports = NotificationRepository
