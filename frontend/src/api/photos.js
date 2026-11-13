import { API_BASE_URL, apiRequest } from './client'

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024

export async function uploadPhoto(incidentId, file, token, photoId) {
  return apiRequest(`/incidents/${incidentId}/photos${photoId ? `/${photoId}` : ''}`, {
    token, method: photoId ? 'PUT' : 'POST', body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
}

export async function loadPhoto(incidentId, photoId, token, thumbnail = false, signal) {
  const response = await fetch(`${API_BASE_URL}/incidents/${incidentId}/photos/${photoId}${thumbnail ? '?thumbnail=1' : ''}`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  })
  if (!response.ok) throw new Error('No se pudo cargar la foto. Revisa tu sesión e intenta de nuevo.')
  return response.blob()
}

export function listPhotos(incidentId, token) {
  return apiRequest('/incidents/' + incidentId + '/photos', { token })
}

export function deletePhoto(incidentId, photoId, token) {
  return apiRequest('/incidents/' + incidentId + '/photos/' + photoId, { token, method: 'DELETE' })
}
