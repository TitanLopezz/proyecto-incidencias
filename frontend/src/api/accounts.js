import { apiRequest } from './client'

export function login({ email, password }, staffMode) {
  return apiRequest(staffMode ? '/staff/auth/login' : '/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  })
}

export function register(account) {
  return apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(account) })
}

export function getCurrentUser(token) {
  return apiRequest('/auth/me', { token })
}

export function listAdmins(token) {
  return apiRequest('/admins', { token })
}

export function createAdmin(account, token) {
  return apiRequest('/admins', { token, method: 'POST', body: JSON.stringify(account) })
}
