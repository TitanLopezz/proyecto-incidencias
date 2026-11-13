import { useEffect, useMemo, useState } from 'react'
import * as L from 'leaflet'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { getIncidentHeatmap } from '../api/incidents'

const HEATMAP_CENTER = [16.7569, -93.1292]

function HeatLayer({ points }) {
  const map = useMap()
  const [layerError, setLayerError] = useState('')
  const heatPoints = useMemo(
    () => points
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      .map((point) => [point.lat, point.lng, point.weight]),
    [points],
  )

  useEffect(() => {
    let isActive = true
    let layer
    globalThis.L = L

    import('leaflet.heat')
      .then(() => {
        if (!isActive) {
          return
        }

        layer = L.heatLayer(heatPoints, {
          radius: 28,
          blur: 20,
          maxZoom: 16,
          max: 1,
          gradient: {
            0.2: '#2563eb',
            0.45: '#22c55e',
            0.7: '#facc15',
            1: '#dc2626',
          },
        })
        layer.addTo(map)
        setLayerError('')
      })
      .catch((error) => {
        if (isActive) {
          setLayerError(`No se pudo cargar la capa de calor: ${error.message}`)
        }
      })

    return () => {
      isActive = false
      if (layer) {
        map.removeLayer(layer)
      }
    }
  }, [heatPoints, map])

  return layerError ? <p className="feedback feedback-error" role="alert">{layerError}</p> : null
}

function HeatmapView({ token, onLogout }) {
  const [points, setPoints] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isActive = true
    getIncidentHeatmap(token)
      .then((data) => {
        if (isActive) {
          setPoints(data)
        }
      })
      .catch((requestError) => {
        if (!isActive) {
          return
        }
        if (requestError.status === 401) {
          onLogout()
          return
        }
        setError(requestError.message)
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [onLogout, token])

  return (
    <section aria-labelledby="heatmap-title" className="heatmap-view">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ANALÍTICA ESPACIAL</p>
          <h2 id="heatmap-title">Mapa de calor de incidencias</h2>
        </div>
        <span className="map-count">
          {points.length} {points.length === 1 ? 'punto' : 'puntos'}
        </span>
      </div>
      {error && <p className="feedback feedback-error" role="alert">{error}</p>}
      {isLoading ? (
        <p className="empty-state">Cargando datos espaciales…</p>
      ) : (
        <>
          <MapContainer
            center={HEATMAP_CENTER}
            className="incident-map heatmap-map"
            scrollWheelZoom
            zoom={12}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <HeatLayer points={points} />
          </MapContainer>
          {points.length === 0 && (
            <p className="empty-state heatmap-empty">
              No hay incidencias con coordenadas para mostrar.
            </p>
          )}
        </>
      )}
    </section>
  )
}

export default HeatmapView
