const express = require('express')
const createIncidentController = require('./controllers/incidentController')
const createAuthController = require('./controllers/AuthController')
const createAuthenticateToken = require('./middleware/authenticateToken')
const authorizeRoles = require('./middleware/authorizeRoles')
const createAdminController = require('./controllers/AdminController')
const createNotificationRoutes = require('./routes/notificationRoutes')
const createTelegramRoutes = require('./routes/telegramRoutes')
const createTeamController = require('./controllers/TeamController')
const createIncidentAssignmentRoutes = require('./routes/incidentAssignmentRoutes')

function createRoutes({ useCases, tokenService, userRepository, readinessCheck, photoService, telegramSecret }) {
  const router = express.Router()
  const incidentController = createIncidentController(useCases)
  const authController = createAuthController(useCases)
  const adminController = createAdminController(useCases)
  const authenticateToken = createAuthenticateToken({ tokenService, userRepository })
  const requireStaff = authorizeRoles('admin', 'superadmin')
  const requireSuperAdmin = authorizeRoles('superadmin')
  if (useCases.incidentAssignments) {
    router.use(createIncidentAssignmentRoutes({
      assignments: useCases.incidentAssignments, authenticateToken, requireStaff,
    }))
  }
  router.use(createNotificationRoutes({ useCases, authenticateToken }))
  if (useCases.telegram && telegramSecret) {
    router.use(createTelegramRoutes({ telegram: useCases.telegram, telegramSecret, authenticateToken }))
  }

  router.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' })
  })
  router.get('/api/health', async (_request, response) => {
    try {
      await readinessCheck()
    } catch (error) {
      return response.status(503).json({
        status: 'not_ready',
        error: {
          message: 'PostgreSQL no está disponible.',
        },
      })
    }

    return response.status(200).json({
      status: 'ok',
      database: 'connected',
    })
  })
  router.get('/ready', async (_request, response) => {
    try {
      await readinessCheck()
    } catch (error) {
      return response.status(503).json({
        status: 'not_ready',
        error: {
          message: 'Una dependencia necesaria no está disponible.',
        },
      })
    }

    response.status(200).json({ status: 'ready' })
  })
  router.get('/api/incidents', authenticateToken, incidentController.list)
  router.get('/api/incidents/archived', authenticateToken, requireStaff, incidentController.listArchived)
  router.post('/api/incidents/:id/archive', authenticateToken, requireStaff, incidentController.archive)
  router.get('/api/analytics/heatmap', authenticateToken, requireStaff, incidentController.heatmap)
  router.get('/api/analytics/clusters', authenticateToken, requireStaff, incidentController.clusters)
  router.post('/api/incidents', authenticateToken, incidentController.create)
  if (photoService) {
    const photoPath = '/api/incidents/:id/photos'
    const authorizePhotoUpload = async (req, _res, next) => {
      await photoService.authorize(photoService.database, req.params.id, req.auth, { write: true })
      next()
    }
    const photoBody = express.raw({ type: () => true, limit: 2 * 1024 * 1024 })
    router.get(photoPath, authenticateToken, async (req, res) => {
      res.json({ data: await photoService.list(req.params.id, req.auth) })
    })
    router.post(photoPath, authenticateToken, authorizePhotoUpload, photoBody, async (req, res) => {
      res.status(201).json({ data: await photoService.save(req.params.id, req.auth, req.body) })
    })
    router.put(`${photoPath}/:photoId`, authenticateToken, authorizePhotoUpload, photoBody, async (req, res) => {
      res.json({ data: await photoService.save(req.params.id, req.auth, req.body, req.params.photoId) })
    })
    router.get(`${photoPath}/:photoId`, authenticateToken, async (req, res) => {
      const image = await photoService.read(req.params.id, req.params.photoId, req.auth, req.query.thumbnail === '1')
      res.set('Cache-Control', 'private, no-store').type('image/webp').send(image)
    })
    router.delete(`${photoPath}/:photoId`, authenticateToken, async (req, res) => {
      await photoService.delete(req.params.id, req.params.photoId, req.auth)
      res.status(204).end()
    })
  }
  router.patch('/api/incidents/:id/status', authenticateToken, requireStaff, incidentController.updateStatus)
  router.put('/api/incidents/:id', authenticateToken, requireStaff, incidentController.update)
  router.post('/api/auth/register', authController.register)
  router.post('/api/auth/login', authController.login)
  router.get('/api/auth/me', authenticateToken, authController.currentUser)
  router.post('/api/staff/auth/login', authController.staffLogin)
  router.get('/api/admins', authenticateToken, requireSuperAdmin, adminController.list)
  router.post('/api/admins', authenticateToken, requireSuperAdmin, adminController.create)

  if (useCases.team) {
    const teamController = createTeamController(useCases.team)
    // Contactos del equipo
    router.get('/api/contactos', authenticateToken, requireStaff, teamController.listContactos)
    router.post('/api/contactos', authenticateToken, requireStaff, teamController.createContacto)
    router.put('/api/contactos/:id', authenticateToken, requireStaff, teamController.updateContacto)
    router.delete('/api/contactos/:id', authenticateToken, requireStaff, teamController.deleteContacto)

    // Historial de llamadas al equipo
    router.get('/api/llamadas', authenticateToken, requireStaff, teamController.listLlamadas)
    router.post('/api/llamadas', authenticateToken, requireStaff, teamController.createLlamada)
  }

  return router
}

module.exports = createRoutes
