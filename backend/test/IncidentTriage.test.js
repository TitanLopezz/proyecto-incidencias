const test = require('node:test')
const assert = require('node:assert/strict')
const IncidentTriageEngine = require('../src/domain/services/IncidentTriageEngine')
const CreateTriagedIncident = require('../src/application/use-cases/CreateTriagedIncident')

test('IncidentTriageEngine evaluates priority based on category, keywords and spatial density', () => {
  // Test 1: Simple pothole without keywords or nearby reports -> MEDIA/BAJA
  const normalReport = IncidentTriageEngine.evaluate({
    category: 'bache',
    description: 'Bache pequeño en la calle lateral.',
    nearbyActiveCount: 0,
  })
  assert.equal(normalReport.priority, 'BAJA')
  assert.equal(normalReport.analysis.isHotspot, false)

  // Test 2: Emergency keyword triggers CRITICA immediately
  const emergencyReport = IncidentTriageEngine.evaluate({
    category: 'bache',
    description: 'Enorme socavón profundo con peligro de derrumbe y accidente inminente.',
    nearbyActiveCount: 0,
  })
  assert.equal(emergencyReport.priority, 'CRITICA')
  assert.ok(emergencyReport.analysis.matchedEmergency.includes('socavón') || emergencyReport.analysis.matchedEmergency.includes('peligro'))

  // Test 3: Spatial hotspot with 3+ nearby reports escalates priority
  const hotspotReport = IncidentTriageEngine.evaluate({
    category: 'alumbrado',
    description: 'Luminaria apagada en la esquina.',
    nearbyActiveCount: 3,
  })
  assert.equal(hotspotReport.priority, 'ALTA')
  assert.equal(hotspotReport.analysis.isHotspot, true)
  assert.equal(hotspotReport.analysis.nearbyIncidentsDetected, 3)
})

test('CreateTriagedIncident use case automatically performs triage and queries nearby incidents', async () => {
  let countNearbyCalled = false
  const mockRepo = {
    async countActiveIncidentsNearby({ longitude, latitude, radiusMeters }) {
      countNearbyCalled = true
      assert.equal(longitude, -93.1152)
      assert.equal(latitude, 16.7528)
      assert.equal(radiusMeters, 150)
      return 4 // Hotspot
    },
    async create(incident) {
      return incident
    },
  }

  const broadcastEvents = []
  const mockWs = {
    broadcastIncidentEvent(event, data) {
      broadcastEvents.push({ event, data })
    },
  }

  const useCase = new CreateTriagedIncident(mockRepo, mockWs)
  const result = await useCase.execute(
    {
      title: 'Fuga peligrosa y socavón',
      description: 'Existe peligro de accidente grave en la zona.',
      category: 'bache',
      latitude: 16.7528,
      longitude: -93.1152,
    },
    'user-uuid-123',
  )

  assert.equal(countNearbyCalled, true)
  assert.equal(result.priority, 'CRITICA')
  assert.equal(result.triageMetadata.isHotspot, true)
  assert.equal(broadcastEvents.length, 1)
  assert.equal(broadcastEvents[0].event, 'incident_created')
})
