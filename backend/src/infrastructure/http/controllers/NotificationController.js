function createNotificationController({ getUserNotifications, markNotificationAsRead }) {
  return {
    async list(request, response) {
      const notifications = await getUserNotifications.execute(request.auth)
      response.status(200).json({ data: notifications })
    },

    async markAsRead(request, response) {
      const notification = await markNotificationAsRead.execute({
        id: request.params.id,
        userId: request.auth.userId,
        role: request.auth.role,
      })
      response.status(200).json({ data: notification })
    },
  }
}

module.exports = createNotificationController
