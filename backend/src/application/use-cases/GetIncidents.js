const ForbiddenError = require('../../domain/errors/ForbiddenError')

class GetIncidents {
  constructor(incidentRepository) {
    this.incidentRepository = incidentRepository
  }

  execute({ userId, role, archived = false }) {
    if (archived && !['admin', 'superadmin'].includes(role)) {
      throw new ForbiddenError('Solo el personal puede consultar incidencias archivadas.')
    }
    return this.incidentRepository.findAll({
      userId,
      role,
      ...(archived ? { archived: true } : {}),
    })
  }
}

module.exports = GetIncidents
