export const API_BASE_URL = import.meta.env.VITE_API_URL

function createApiError(message, code, status) {
  const error = new Error(message)
  error.code = code
  if (status !== undefined) {
    error.status = status
  }
  return error
}

export async function apiRequest(path, { token, headers, ...options } = {}) {
  if (!API_BASE_URL) {
    throw createApiError('VITE_API_URL no está configurada.', 'API_CONFIGURATION')
  }

  const requestHeaders = new Headers(headers)

  if (options.body !== undefined && !requestHeaders.has('content-type')) {
    requestHeaders.set('content-type', 'application/json')
  }

  if (token) {
    requestHeaders.set('authorization', `Bearer ${token}`)
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: requestHeaders,
    })
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error
    }

    throw createApiError(
      'No se pudo conectar con el backend. Comprueba que esté iniciado y que VITE_API_URL sea correcta.',
      'API_UNAVAILABLE',
    )
  }

  const responseBody = await response.text()
  let payload = null
  try {
    payload = responseBody ? JSON.parse(responseBody) : null
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error
    }

    const parseError = createApiError(
      `La API devolvió una respuesta inválida (HTTP ${response.status}); se esperaba JSON.`,
      'INVALID_API_RESPONSE',
      response.status,
    )
    throw parseError
  }

  if (!response.ok) {
    const message = payload?.error?.message || `La solicitud falló (${response.status}).`
    const code = response.status === 502 || response.status === 503
      ? 'API_UNAVAILABLE'
      : 'API_ERROR'
    throw createApiError(message, code, response.status)
  }

  return payload?.data
}
