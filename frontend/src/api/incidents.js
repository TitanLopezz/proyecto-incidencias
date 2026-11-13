import { apiRequest } from './client'

export function listIncidents(token) {
  return apiRequest('/incidents', { token })
}

export function createIncident(report, token) {
  return apiRequest('/incidents', { token, method: 'POST', body: JSON.stringify(report) })
}

export function updateIncident(id, report, token) {
  return apiRequest(`/incidents/${id}`, { token, method: 'PUT', body: JSON.stringify(report) })
}

export function updateIncidentStatus(id, status, token) {
  return apiRequest(`/incidents/${id}/status`, { token, method: 'PATCH', body: JSON.stringify({ status }) })
}

export function archiveIncident(id, reason, token) {
  return apiRequest(`/incidents/${id}/archive`, { token, method: 'POST', body: JSON.stringify({ reason }) })
}

export function listArchivedIncidents(token) {
  return apiRequest('/incidents/archived', { token })
}

export function listIncidentAssignments(token) {
  return apiRequest('/incidents/assignments', { token })
}

export function assignIncident(id, contactId, token) {
  return apiRequest(`/incidents/${id}/assignment`, {
    token, method: 'PUT', body: JSON.stringify({ contactId }),
  })
}

export function listIncidentAssignmentHistory(id, token) {
  return apiRequest(`/incidents/${id}/assignment-history`, { token })
}

export function getIncidentHeatmap(token) {
  return apiRequest('/analytics/heatmap', { token })
}
