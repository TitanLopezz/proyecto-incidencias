const Incident = require('../../domain/entities/Incident')
const NotFoundError = require('../../domain/errors/NotFoundError')
const notifyIncidentChange = require('../notifyIncidentChange')

class UpdateIncident {
  constructor(incidentRepository, notificationSender) {
    this.incidentRepository = incidentRepository
    this.notificationSender = notificationSender
  }

  async execute({ id, title, description, status, updatedBy }) {
    if (!Incident.isValidId(id)) {
      throw new NotFoundError('No se encontró la incidencia.')
    }

    const updatedIncident = Incident.update({ title, description, status })
    const result = await this.incidentRepository.update(id, updatedIncident, updatedBy)
    if (!result) {
      throw new NotFoundError('No se encontró la incidencia.')
    }

    await notifyIncidentChange(this.notificationSender, result)
    return result.incident
  }
}

module.exports = UpdateIncident
