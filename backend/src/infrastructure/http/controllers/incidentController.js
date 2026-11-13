function createIncidentController({
  createIncident,
  listIncidents,
  updateIncident,
  updateIncidentStatus,
  getIncidentHeatmap,
  getSpatialClusters,
  archiveIncident,
}) {
  return {
    async create(request, response) {
      const incident = await createIncident.execute(request.body, request.auth.userId)
      response.status(201).json({ data: incident })
    },

    async list(request, response) {
      const incidents = await listIncidents.execute(request.auth)
      response.status(200).json({ data: incidents })
    },

    async listArchived(request, response) {
      const incidents = await listIncidents.execute({ ...request.auth, archived: true })
      response.set('Cache-Control', 'no-store').status(200).json({ data: incidents })
    },

    async update(request, response) {
      const incident = await updateIncident.execute({
        ...request.body,
        id: request.params.id,
        updatedBy: request.auth.userId,
      })
      response.status(200).json({ data: incident })
    },

    async updateStatus(request, response) {
      const incident = await updateIncidentStatus.execute({
        id: request.params.id,
        status: request.body.status,
        userId: request.auth.userId,
        role: request.auth.role,
      })
      response.status(200).json({ data: incident })
    },

    async heatmap(request, response) {
      const points = await getIncidentHeatmap.execute(request.auth)
      response.status(200).json({ data: points })
    },

    async clusters(request, response) {
      if (!getSpatialClusters) {
        return response.status(200).json({ data: [] })
      }
      const clusters = await getSpatialClusters.execute({
        role: request.auth.role,
        epsMeters: request.query.epsMeters === undefined ? 200 : Number(request.query.epsMeters),
        minPoints: request.query.minPoints === undefined ? 2 : Number(request.query.minPoints),
      })
      response.status(200).json({ data: clusters })
    },

    async archive(request, response) {
      await archiveIncident.execute({
        ...request.auth, id: request.params.id, reason: request.body?.reason,
      })
      response.status(204).end()
    },
  }
}

module.exports = createIncidentController
