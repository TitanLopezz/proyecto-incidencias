export function createSubmitIncident({ createIncident, uploadPhoto }) {
  return async function submitIncident({ report, pendingIncident, photos, token }) {
    const incident = pendingIncident ?? await createIncident(report, token)

    for (const [index, photo] of photos.entries()) {
      try {
        await uploadPhoto(incident.id, photo, token)
      } catch (cause) {
        return { incident, pendingPhotos: photos.slice(index), uploadError: cause }
      }
    }

    return { incident, pendingPhotos: [] }
  }
}
