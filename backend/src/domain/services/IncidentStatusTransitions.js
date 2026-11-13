const ValidationError = require('../errors/ValidationError')

const NEXT_STATUS = Object.freeze({
  abierta: 'en_proceso',
  en_proceso: 'resuelta',
  resuelta: 'cerrada',
  cerrada: null,
})

class IncidentStatusTransitions {
  static canTransition(currentStatus, nextStatus) {
    return NEXT_STATUS[currentStatus] === nextStatus
  }

  static assertCanTransition(currentStatus, nextStatus) {
    if (!IncidentStatusTransitions.canTransition(currentStatus, nextStatus)) {
      throw new ValidationError(
        `No se permite cambiar el estado de «${currentStatus}» a «${nextStatus}».`,
      )
    }
  }
}

module.exports = IncidentStatusTransitions
