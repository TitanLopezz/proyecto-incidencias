const Incident = require('../../domain/entities/Incident')
const ForbiddenError = require('../../domain/errors/ForbiddenError')
const NotFoundError = require('../../domain/errors/NotFoundError')
const ValidationError = require('../../domain/errors/ValidationError')

class ArchiveIncident {
  constructor(incidentRepository) {
    this.incidentRepository = incidentRepository
  }

  async execute({ id, reason, userId, role }) {
    if (!['admin', 'superadmin'].includes(role)) {
      throw new ForbiddenError('Solo el personal puede archivar incidencias.')
    }
    if (!Incident.isValidId(id)) throw new NotFoundError('No se encontró la incidencia.')

    const normalized = typeof reason === 'string' ? reason.trim() : ''
    if (!normalized || normalized.length > 500) {
      throw new ValidationError('Escribe un motivo de archivo de entre 1 y 500 caracteres.')
    }

    const archived = await this.incidentRepository.archive(id, userId, normalized)
    if (!archived) throw new NotFoundError('No se encontró la incidencia.')
  }
}

module.exports = ArchiveIncident
