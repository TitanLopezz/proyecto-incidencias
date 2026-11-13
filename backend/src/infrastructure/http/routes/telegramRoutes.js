const { timingSafeEqual } = require('node:crypto')
const express = require('express')
const authorizeRoles = require('../middleware/authorizeRoles')

function createTelegramRoutes({ telegram, telegramSecret, authenticateToken }) {
  const router = express.Router()
  const requireCitizen = authorizeRoles('citizen')
  const expected = Buffer.from(telegramSecret)

  router.post('/api/telegram/link', authenticateToken, requireCitizen, async (request, response) => {
    const data = await telegram.createLink(request.auth.userId)
    response.set('Cache-Control', 'no-store').status(201).json({ data })
  })
  router.delete('/api/telegram/link', authenticateToken, requireCitizen, async (request, response) => {
    await telegram.unlink(request.auth.userId)
    response.status(204).end()
  })
  router.get('/api/telegram/notifications', authenticateToken, requireCitizen, async (request, response) => {
    const data = await telegram.getPreference(request.auth.userId)
    response.set('Cache-Control', 'no-store').json({ data })
  })
  router.put('/api/telegram/notifications', authenticateToken, requireCitizen, async (request, response) => {
    const data = await telegram.setPreference(request.auth.userId, request.body?.enabled)
    response.set('Cache-Control', 'no-store').json({ data })
  })
  router.post('/api/integrations/telegram', async (request, response) => {
    const provided = Buffer.from(request.get('x-telegram-integration-key') ?? '')
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return response.status(401).json({ error: { message: 'Credencial de integración inválida.' } })
    }
    const data = await telegram.execute(request.body ?? {})
    return response.set('Cache-Control', 'no-store').status(200).json({ data })
  })
  return router
}

module.exports = createTelegramRoutes
