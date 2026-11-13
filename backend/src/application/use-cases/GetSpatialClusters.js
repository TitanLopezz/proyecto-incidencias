const ForbiddenError = require('../../domain/errors/ForbiddenError')
const ValidationError = require('../../domain/errors/ValidationError')

class GetSpatialClusters {
  constructor(incidentRepository) {
    this.incidentRepository = incidentRepository
  }

  async execute({ role, epsMeters = 200, minPoints = 2 }) {
    if (!['admin', 'superadmin'].includes(role)) {
      throw new ForbiddenError('Solo el personal puede consultar el análisis de clusters.')
    }
    if (!Number.isFinite(epsMeters) || epsMeters < 1 || epsMeters > 10000
      || !Number.isInteger(minPoints) || minPoints < 2 || minPoints > 1000) {
      throw new ValidationError('epsMeters debe estar entre 1 y 10000 y minPoints entre 2 y 1000 (entero).')
    }
    return this.incidentRepository.getSpatialClusters({ epsMeters, minPoints })
  }
}

module.exports = GetSpatialClusters
