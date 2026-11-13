import { useState } from 'react'
import { submitIncident } from '../incidentServices'
import { LocationPickerMap } from './IncidentMaps'
import { PhotoPicker } from './IncidentPhotos'

function CreateIncidentForm({ token, onCreated, onUnauthorized }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState(null)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [photos, setPhotos] = useState([])
  const [pendingIncident, setPendingIncident] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!location && !pendingIncident) {
      setError('Marca la ubicación de la incidencia en el mapa antes de enviar el reporte.')
      return
    }
    setIsSubmitting(true)

    try {
      const { incident, pendingPhotos, uploadError } = await submitIncident({
        token,
        pendingIncident,
        photos,
        report: {
          title,
          description,
          category,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
        },
      })
      if (uploadError) {
        setPendingIncident(incident)
        setPhotos(pendingPhotos)
        throw new Error(`El reporte ya se guardó. Faltan fotos por subir: ${uploadError.message}. Puedes reintentar o continuar sin esas fotos.`, { cause: uploadError })
      }
      setPhotos([])
      setPendingIncident(null)
      onCreated(incident)
      setTitle('')
      setDescription('')
      setCategory('')
      setLocation(null)
    } catch (requestError) {
      if (requestError.status === 401 || requestError.cause?.status === 401) {
        onUnauthorized()
      } else {
        setError(requestError.message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section aria-labelledby="create-incident-title" className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">NUEVO REPORTE</p>
          <h2 id="create-incident-title">Registrar incidencia</h2>
        </div>
      </div>
      <form className="incident-form" onSubmit={handleSubmit}>
        <fieldset disabled={isSubmitting || Boolean(pendingIncident)} style={{ display: 'contents' }}>
        <label htmlFor="incident-title">Título</label>
        <input
          id="incident-title"
          maxLength={150}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ej. Luminaria apagada"
          required
          value={title}
        />
        <label htmlFor="incident-category">Categoría</label>
        <select
          id="incident-category"
          onChange={(event) => setCategory(event.target.value)}
          required
          value={category}
        >
          <option disabled value="">Selecciona una categoría</option>
          <option value="bache">Bache</option>
          <option value="alumbrado">Alumbrado público</option>
          <option value="basura">Basura</option>
        </select>
        <label htmlFor="incident-description">Descripción</label>
        <textarea
          id="incident-description"
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe el problema y dónde ocurre"
          required
          rows={4}
          value={description}
        />
        <fieldset className="location-fieldset">
          <legend>Ubicación del reporte</legend>
          <LocationPickerMap onChange={setLocation} value={location} />
          {!location && (
            <p className="field-hint location-required-hint">
              La ubicación es obligatoria. Marca un punto en el mapa para continuar.
            </p>
          )}
        </fieldset>
        </fieldset>
        <PhotoPicker files={photos} onChange={setPhotos} disabled={isSubmitting} />
        {pendingIncident && <p role="status">El reporte ya está guardado. Al continuar se enviarán solamente las fotos pendientes. Puedes quitarlas para finalizar sin ellas.</p>}
        <div className="form-footer">
          {error && <p className="feedback feedback-error" role="alert">{error}</p>}
          <button className="button button-primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Guardando…' : pendingIncident ? 'Continuar con el reporte guardado' : 'Crear incidencia'}
          </button>
        </div>
      </form>
    </section>
  )
}

export default CreateIncidentForm
