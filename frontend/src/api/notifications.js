import { apiRequest } from './client'

export function listNotifications(token) {
  return apiRequest('/notifications', { token })
}

export function markNotificationRead(id, token) {
  return apiRequest('/notifications/' + id + '/read', { token, method: 'PATCH' })
}
