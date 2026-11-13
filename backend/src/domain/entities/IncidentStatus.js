const ValidationError = require('../errors/ValidationError')

class IncidentStatus {
  constructor(value) {
    this.value = value
  }

  static create(value) {
    if (!IncidentStatus.VALUES.includes(value)) {
      throw new ValidationError('El estado de la incidencia no es válido.')
    }

    return new IncidentStatus(value)
  }
}

IncidentStatus.VALUES = Object.freeze([
  'abierta',
  'en_proceso',
  'resuelta',
  'cerrada',
])

module.exports = IncidentStatus
