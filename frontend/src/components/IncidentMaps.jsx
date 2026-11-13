import { useEffect, useState } from 'react'
import { divIcon, latLngBounds } from 'leaflet'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'

const TUXTLA_CENTER = [16.7528, -93.1152]
const INCIDENT_STATUS_LABELS = {
  abierta: 'Abierta',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta',
  cerrada: 'Cerrada',
}

function createIncidentIcon(status = 'abierta') {
  const knownStatus = Object.hasOwn(INCIDENT_STATUS_LABELS, status) ? status : 'abierta'
  return divIcon({
    className: `incident-map-marker incident-map-marker-${knownStatus}`,
    html: '<span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

const LOCATION_ICON = divIcon({
  className: 'incident-map-marker',
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

function ClickToSelect({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      })
    },
  })

  return null
}

function FitIncidentBounds({ incidents }) {
  const map = useMap()

  useEffect(() => {
    const locatedIncidents = incidents.filter(
      (incident) => Number.isFinite(incident.latitude)
        && Number.isFinite(incident.longitude),
    )

    if (locatedIncidents.length === 1) {
      map.setView([locatedIncidents[0].latitude, locatedIncidents[0].longitude], 14)
    } else if (locatedIncidents.length > 1) {
      const bounds = latLngBounds(
        locatedIncidents.map((incident) => [incident.latitude, incident.longitude]),
      )
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 })
    }
  }, [incidents, map])

  return null
}

function KeepPickerCentered({ position }) {
  const map = useMap()

  useEffect(() => {
    if (position) {
      map.setView(position, Math.max(map.getZoom(), 13))
    }
  }, [map, position])

  return null
}

export function LocationPickerMap({ value, onChange }) {
  const markerPosition = value ? [value.latitude, value.longitude] : null
  const [locationError, setLocationError] = useState('')
  const [isLocating, setIsLocating] = useState(false)

  function selectPosition(position) {
    setLocationError('')
    onChange(position)
  }

  function useCurrentLocation() {
    setLocationError('')
    if (!navigator.geolocation) {
      setLocationError('Este navegador no permite obtener la ubicación actual.')
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        selectPosition({
          latitude: Number(coords.latitude.toFixed(6)),
          longitude: Number(coords.longitude.toFixed(6)),
        })
        setIsLocating(false)
      },
      (error) => {
        setLocationError(error.code === error.PERMISSION_DENIED
          ? 'No se concedió el permiso de ubicación. Puedes marcar el punto directamente en el mapa.'
          : 'No se pudo obtener tu ubicación. Puedes marcar el punto directamente en el mapa.')
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="location-picker">
      <div className="location-picker-actions">
        <p className="map-instructions">Haz clic en el mapa para marcar dónde ocurrió; puedes arrastrar el marcador para ajustarlo.</p>
        <button
          className="button button-secondary"
          disabled={isLocating}
          onClick={useCurrentLocation}
          type="button"
        >
          {isLocating ? 'Obteniendo ubicación…' : 'Usar mi ubicación actual'}
        </button>
      </div>
      <MapContainer
        center={markerPosition || TUXTLA_CENTER}
        className="incident-map location-picker-map"
        scrollWheelZoom
        zoom={markerPosition ? 14 : 13}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickToSelect onSelect={selectPosition} />
        <KeepPickerCentered position={markerPosition} />
        {markerPosition && (
          <Marker
            draggable
            eventHandlers={{
              dragend(event) {
                const position = event.target.getLatLng()
                selectPosition({
                  latitude: Number(position.lat.toFixed(6)),
                  longitude: Number(position.lng.toFixed(6)),
                })
              },
            }}
            icon={LOCATION_ICON}
            position={markerPosition}
          >
            <Popup>Ubicación seleccionada</Popup>
          </Marker>
        )}
      </MapContainer>
      {value ? (
        <div className="selected-coordinates" aria-live="polite">
          <span>Latitud: {value.latitude.toFixed(6)}</span>
          <span>Longitud: {value.longitude.toFixed(6)}</span>
          <button className="text-button" onClick={() => onChange(null)} type="button">
            Quitar ubicación
          </button>
        </div>
      ) : (
        <p className="field-hint">Aún no hay un punto marcado.</p>
      )}
      {locationError && <p className="feedback feedback-error" role="alert">{locationError}</p>}
    </div>
  )
}

function IncidentMap({ incidents, staffView = false }) {
  const locatedIncidents = incidents.filter(
    (incident) => Number.isFinite(incident.latitude)
      && Number.isFinite(incident.longitude),
  )

  return (
    <div className="incident-map-section">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">VISTA GEOGRÁFICA</p>
          <h2>Mapa de incidencias</h2>
        </div>
        <span className="map-count">
          {locatedIncidents.length} {locatedIncidents.length === 1 ? 'ubicación' : 'ubicaciones'}
        </span>
      </div>
      {locatedIncidents.length === 0 ? (
        <p className="empty-state">Los reportes con ubicación aparecerán aquí.</p>
      ) : (
        <MapContainer
          center={[locatedIncidents[0].latitude, locatedIncidents[0].longitude]}
          className="incident-map overview-map"
          scrollWheelZoom
          zoom={12}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitIncidentBounds incidents={locatedIncidents} />
          {locatedIncidents.map((incident) => (
            <Marker
              icon={createIncidentIcon(incident.status)}
              key={incident.id}
              position={[incident.latitude, incident.longitude]}
            >
              <Popup>
                <strong>{incident.title}</strong>
                <p>Categoría: {incident.categoryName || incident.category || 'Sin categoría'}</p>
                <p>Estado: {INCIDENT_STATUS_LABELS[incident.status] || incident.status}</p>
                {incident.createdAt && Number.isFinite(new Date(incident.createdAt).getTime()) && (
                  <p>
                    Fecha: <time dateTime={new Date(incident.createdAt).toISOString()}>
                      {new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(
                        new Date(incident.createdAt),
                      )}
                    </time>
                  </p>
                )}
                <p>{incident.description}</p>
                {staffView && incident.reporter && (
                  <p>Reportó: {incident.reporter.name} ({incident.reporter.email})</p>
                )}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  )
}

export default IncidentMap
