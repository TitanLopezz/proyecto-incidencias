const Notification = require('../entities/Notification')

const labels = Object.freeze({
  abierta: 'Abierta',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta',
  cerrada: 'Cerrada',
})

function createWebNotice({ id, createdBy: userId, title, status }) {
  return Notification.create({
    userId, incidentId: id, message: `El estado de tu incidencia «${title}» cambió a «${labels[status]}».`,
  })
}

function telegramNotice({ incidentId, status }) {
  return `Folio: ${incidentId}\nEstado: ${labels[status]}`
}

module.exports = { createWebNotice, telegramNotice }
