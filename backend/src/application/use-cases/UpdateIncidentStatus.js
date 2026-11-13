const Incident = require('../../domain/entities/Incident')
const ForbiddenError = require('../../domain/errors/ForbiddenError')
const NotFoundError = require('../../domain/errors/NotFoundError')
const ValidationError = require('../../domain/errors/ValidationError')
const notifyIncidentChange = require('../notifyIncidentChange')

class UpdateIncidentStatus {
  constructor(incidentRepository, notificationSender) {
    this.incidentRepository = incidentRepository
    this.notificationSender = notificationSender
  }

  async execute({ id, status, userId, role }) {
    if (!['admin', 'superadmin'].includes(role)) {
      throw new ForbiddenError('Solo el personal puede cambiar el estado de las incidencias.')
    }

    if (!Incident.isValidId(id)) {
      throw new NotFoundError('No se encontró la incidencia.')
    }

    if (!Incident.STATUSES.includes(status)) {
      throw new ValidationError('El estado de la incidencia no es válido.')
    }

    const result = await this.incidentRepository.updateStatus(id, status, userId)
    if (!result) {
      throw new NotFoundError('No se encontró la incidencia.')
    }

    await notifyIncidentChange(this.notificationSender, result)
    return result.incident
  }
}

module.exports = UpdateIncidentStatus
