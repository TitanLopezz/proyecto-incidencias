function createTeamController(team) {
  return {
    async listContactos(request, response) {
      const data = await team.listContactos({ soloActivos: request.query.activos === 'true' })
      return response.status(200).json({ data })
    },

    async createContacto(request, response) {
      const data = await team.createContacto(request.body || {})
      return response.status(201).json({ data })
    },

    async updateContacto(request, response) {
      const data = await team.updateContacto(request.params.id, request.body || {})
      return response.status(200).json({ data })
    },

    async deleteContacto(request, response) {
      const data = await team.deleteContacto(request.params.id)
      return response.status(200).json({ data })
    },

    async listLlamadas(request, response) {
      const data = await team.listLlamadas({ incident_id: request.query.incident_id })
      return response.status(200).json({ data })
    },

    async createLlamada(request, response) {
      const data = await team.createLlamada(request.body || {}, request.auth?.userId || null)
      return response.status(201).json({ data })
    },
  }
}

module.exports = createTeamController
