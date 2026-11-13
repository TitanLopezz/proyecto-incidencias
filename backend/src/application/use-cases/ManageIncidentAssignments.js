const Incident = require('../../domain/entities/Incident')
const ForbiddenError = require('../../domain/errors/ForbiddenError')
const NotFoundError = require('../../domain/errors/NotFoundError')
const ValidationError = require('../../domain/errors/ValidationError')
const ConflictError = require('../../domain/errors/ConflictError')

class ManageIncidentAssignments {
  constructor({ repository, policy, clock }) {
    Object.assign(this, { repository, policy, clock })
  }

  async list({ role }) {
    requireStaff(role)
    const items = await this.repository.listOperational()
    const now = this.clock()
    return items.map(item => this.policy.describe(item, now))
  }

  async assign({ id, contactId, userId, role }) {
    requireStaff(role)
    validateIncidentId(id)
    if (!Incident.isValidId(contactId)) throw new ValidationError('Selecciona un contacto de cuadrilla válido.')
    const receivedAt = await this.repository.findReception(id)
    if (!receivedAt) throw new NotFoundError('No se encontró la incidencia activa.')
    const result = await this.repository.assign({
      id, contactId, userId, dueAt: this.policy.deadlineFor(receivedAt),
    })
    if (result === 'incident-unavailable') throw new ConflictError('La incidencia ya no está disponible para asignar.')
    if (result === 'contact-unavailable') throw new ConflictError('El contacto de cuadrilla ya no está activo.')
  }

  history({ id, role }) {
    requireStaff(role)
    validateIncidentId(id)
    return this.repository.history(id)
  }
}

function requireStaff(role) {
  if (!['admin', 'superadmin'].includes(role)) {
    throw new ForbiddenError('Solo el personal puede gestionar asignaciones.')
  }
}

function validateIncidentId(id) {
  if (!Incident.isValidId(id)) throw new NotFoundError('No se encontró la incidencia.')
}

module.exports = ManageIncidentAssignments
