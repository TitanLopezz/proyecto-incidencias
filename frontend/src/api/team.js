import { apiRequest } from './client'

export function listContacts(token, { activeOnly = false } = {}) {
  return apiRequest(activeOnly ? '/contactos?activos=true' : '/contactos', { token })
}

export function saveContact(contact, token, id) {
  return apiRequest(id ? '/contactos/' + id : '/contactos', {
    token, method: id ? 'PUT' : 'POST', body: JSON.stringify(contact),
  })
}

export function deleteContact(id, token) {
  return apiRequest('/contactos/' + id, { token, method: 'DELETE' })
}

export function listCalls(token, incidentId) {
  const query = incidentId ? '?incident_id=' + encodeURIComponent(incidentId) : ''
  return apiRequest('/llamadas' + query, { token })
}

export function createCall(call, token) {
  return apiRequest('/llamadas', { token, method: 'POST', body: JSON.stringify(call) })
}
