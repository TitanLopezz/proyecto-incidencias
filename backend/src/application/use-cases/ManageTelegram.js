const Incident = require('../../domain/entities/Incident')
const ForbiddenError = require('../../domain/errors/ForbiddenError')
const NotFoundError = require('../../domain/errors/NotFoundError')
const ValidationError = require('../../domain/errors/ValidationError')
const ConflictError = require('../../domain/errors/ConflictError')

class ManageTelegram {
  constructor({ links, codes, createIncident, listIncidents, notificationsAvailable = false }) {
    Object.assign(this, { links, codes, createIncident, listIncidents, notificationsAvailable })
  }

  async createLink(userId) {
    const code = this.codes.issue()
    await this.links.storeCode(userId, this.codes.hash(code))
    return { code }
  }

  unlink(userId) {
    return this.links.unlink(userId)
  }

  async getPreference(userId) {
    return { ...await this.links.getPreference(userId), available: this.notificationsAvailable }
  }

  async setPreference(userId, enabled) {
    if (typeof enabled !== 'boolean') throw new ValidationError('Indica si quieres recibir avisos.')
    if (enabled && !this.notificationsAvailable) throw new ConflictError('El envío de avisos por Telegram aún no está disponible.')
    const preference = await this.links.setPreference(userId, enabled)
    if (!preference) throw new ConflictError('Vincula tu chat de Telegram para configurar los avisos.')
    return { ...preference, available: this.notificationsAvailable }
  }

  async execute({ chatId, action, code, folio, incident } = {}) {
    if (typeof chatId !== 'string' || !/^[1-9][0-9]{0,15}$/.test(chatId)) {
      throw new ValidationError('El chat de Telegram no es válido.')
    }
    if (action === 'link') {
      if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)
        || !(await this.links.redeem(this.codes.hash(code), chatId))) {
        throw new ValidationError('El enlace venció o ya se usó. Abre Telegram de nuevo desde tu cuenta ciudadana.')
      }
      return { linked: true }
    }

    const userId = await this.links.findCitizen(chatId)
    if (!userId) {
      throw new ForbiddenError('Vincula tu chat con el botón Abrir Telegram de tu cuenta ciudadana.')
    }
    if (action === 'create') {
      const created = await this.createIncident.execute(incident, userId)
      return { id: created.id }
    }
    if (action !== 'recent' && (action !== 'status' || !Incident.isValidId(folio))) {
      throw new ValidationError('La consulta de Telegram no es válida.')
    }

    const reports = await this.listIncidents.execute({ userId, role: 'citizen' })
    if (action === 'recent') return reports.slice(0, 3).map(publicReport)
    const report = reports.find(item => item.id === folio)
    if (!report) throw new NotFoundError('No encontré ese folio entre tus reportes.')
    return publicReport(report)
  }
}

function publicReport({ id, title, status, updatedAt, createdAt }) {
  return { id, title, status, updatedAt, createdAt }
}

module.exports = ManageTelegram
