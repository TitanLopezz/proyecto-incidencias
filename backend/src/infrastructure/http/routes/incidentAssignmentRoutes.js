const express = require('express')

function createIncidentAssignmentRoutes({ assignments, authenticateToken, requireStaff }) {
  const router = express.Router()
  router.get('/api/incidents/assignments', authenticateToken, requireStaff, async (request, response) => {
    const data = await assignments.list(request.auth)
    response.set('Cache-Control', 'no-store').json({ data })
  })
  router.get('/api/incidents/:id/assignment-history', authenticateToken, requireStaff, async (request, response) => {
    const data = await assignments.history({ ...request.auth, id: request.params.id })
    response.set('Cache-Control', 'no-store').json({ data })
  })
  router.put('/api/incidents/:id/assignment', authenticateToken, requireStaff, async (request, response) => {
    await assignments.assign({ ...request.auth, id: request.params.id, contactId: request.body?.contactId })
    response.status(204).end()
  })
  return router
}

module.exports = createIncidentAssignmentRoutes
