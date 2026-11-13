const ForbiddenError = require('../../domain/errors/ForbiddenError')

class GetIncidentHeatmap {
  constructor(incidentRepository) {
    this.incidentRepository = incidentRepository
  }

  async execute({ role }) {
    if (!['admin', 'superadmin'].includes(role)) {
      throw new ForbiddenError('Solo el personal puede consultar el mapa de calor.')
    }

    return this.incidentRepository.getHeatmapData()
  }
}

module.exports = GetIncidentHeatmap
