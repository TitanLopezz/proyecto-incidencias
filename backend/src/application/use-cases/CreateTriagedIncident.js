const Incident = require('../../domain/entities/Incident')
const IncidentTriageEngine = require('../../domain/services/IncidentTriageEngine')

class CreateTriagedIncident {
  constructor(incidentRepository, notificationSender = null) {
    this.incidentRepository = incidentRepository
    this.notificationSender = notificationSender
  }

  async execute(input, userId) {
    const incident = Incident.create({ ...input, createdBy: userId })
    let nearbyActiveCount = 0
    if (this.incidentRepository.countActiveIncidentsNearby && incident.latitude !== null && incident.longitude !== null) {
      try {
        nearbyActiveCount = await this.incidentRepository.countActiveIncidentsNearby({
          longitude: incident.longitude,
          latitude: incident.latitude,
          radiusMeters: 150,
        })
      } catch {
        nearbyActiveCount = 0
      }
    }

    const triage = IncidentTriageEngine.evaluate({
      category: incident.category,
      description: incident.description,
      nearbyActiveCount,
    })

    incident.priority = triage.priority
    incident.triageMetadata = triage.analysis

    const created = await this.incidentRepository.create(incident)

    if (this.notificationSender && typeof this.notificationSender.broadcastIncidentEvent === 'function') {
      this.notificationSender.broadcastIncidentEvent('incident_created', created)
    }

    return created
  }
}

module.exports = CreateTriagedIncident
