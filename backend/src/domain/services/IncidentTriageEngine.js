const EMERGENCY_KEYWORDS = [
  'peligro', 'socavon', 'socavón', 'fuga de gas', 'alto voltaje',
  'cable suelto', 'inundacion', 'inundación', 'accidente', 'heridos', 'derrumbe',
]

const WARNING_KEYWORDS = [
  'profundo', 'urgente', 'bloqueado', 'riesgo', 'intransitable', 'alcantarilla abierta',
]

const CATEGORY_WEIGHTS = {
  bache: 20,
  alumbrado: 15,
  basura: 10,
}

class IncidentTriageEngine {
  static evaluate({ category, description, nearbyActiveCount = 0 } = {}) {
    let score = CATEGORY_WEIGHTS[category] || 10
    const descLower = (description || '').toLowerCase()
    const matchedEmergency = []
    const matchedWarning = []

    for (const kw of EMERGENCY_KEYWORDS) {
      if (descLower.includes(kw)) {
        score += 35
        matchedEmergency.push(kw)
      }
    }

    for (const kw of WARNING_KEYWORDS) {
      if (descLower.includes(kw)) {
        score += 15
        matchedWarning.push(kw)
      }
    }

    const spatialBoost = Math.min(nearbyActiveCount * 12, 36)
    score += spatialBoost

    let priority = 'BAJA'
    if (score >= 70 || matchedEmergency.length > 0) {
      priority = 'CRITICA'
    } else if (score >= 45 || nearbyActiveCount >= 3) {
      priority = 'ALTA'
    } else if (score >= 25) {
      priority = 'MEDIA'
    }

    return {
      priority,
      score,
      analysis: {
        categoryBaseScore: CATEGORY_WEIGHTS[category] || 10,
        matchedEmergency,
        matchedWarning,
        nearbyIncidentsDetected: nearbyActiveCount,
        isHotspot: nearbyActiveCount >= 3,
      },
    }
  }
}

module.exports = IncidentTriageEngine
