async function notifyIncidentChange(sender, { incident, notification }) {
  if (!sender || !notification) return
  try {
    await sender.sendToUser(incident.createdBy, notification, incident)
  } catch {
    // The web notification is already committed and will appear on refresh.
    console.warn('No se pudo emitir una actualización de incidencia por Socket.IO.')
  }
}

module.exports = notifyIncidentChange
