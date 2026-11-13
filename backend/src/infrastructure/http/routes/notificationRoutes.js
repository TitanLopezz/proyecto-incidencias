const express = require('express')
const createNotificationController = require('../controllers/NotificationController')
const authorizeRoles = require('../middleware/authorizeRoles')

function createNotificationRoutes({ useCases, authenticateToken }) {
  const router = express.Router()
  const controller = createNotificationController(useCases)
  const requireCitizen = authorizeRoles('citizen')

  router.get('/api/notifications', authenticateToken, requireCitizen, controller.list)
  router.patch('/api/notifications/:id/read', authenticateToken, requireCitizen, controller.markAsRead)

  return router
}

module.exports = createNotificationRoutes
