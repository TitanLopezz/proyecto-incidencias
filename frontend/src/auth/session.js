export const TOKEN_STORAGE_KEY = 'incidencias.accessToken'
export const USER_STORAGE_KEY = 'incidencias.user'
export const STAFF_ROLES = new Set(['admin', 'superadmin'])

export function saveSession({ token, user }) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(USER_STORAGE_KEY)
}

export function readStoredUser() {
  const serializedUser = localStorage.getItem(USER_STORAGE_KEY)
  if (!serializedUser) {
    return null
  }

  try {
    return JSON.parse(serializedUser)
  } catch {
    clearSession()
    return null
  }
}
