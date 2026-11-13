const Incident = require('../../domain/entities/Incident')

class CreateIncident {
  constructor(incidentRepository) {
    this.incidentRepository = incidentRepository
  }

  execute(input, userId) {
    const incident = Incident.create({ ...input, createdBy: userId })
    return this.incidentRepository.create(incident)
  }
}

module.exports = CreateIncident
