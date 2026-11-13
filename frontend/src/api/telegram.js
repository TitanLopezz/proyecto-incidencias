import { apiRequest } from './client'

export function createTelegramLink(token) {
  return apiRequest('/telegram/link', { token, method: 'POST' })
}

export function unlinkTelegram(token) {
  return apiRequest('/telegram/link', { token, method: 'DELETE' })
}

export function getTelegramNotifications(token) {
  return apiRequest('/telegram/notifications', { token })
}

export function setTelegramNotifications(enabled, token) {
  return apiRequest('/telegram/notifications', { token, method: 'PUT', body: JSON.stringify({ enabled }) })
}
