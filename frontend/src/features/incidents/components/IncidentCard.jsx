import React, { useState } from 'react'
import './IncidentCard.css'
import IncidentPhotos from '../../../components/IncidentPhotos'
import { describeIncidentStatus } from '../status'

const PRIORITY_CONFIG = {
  CRITICA: { label: 'Crítica', className: 'priority-critica' },
  ALTA: { label: 'Alta', className: 'priority-alta' },
  MEDIA: { label: 'Media', className: 'priority-media' },
  BAJA: { label: 'Baja', className: 'priority-baja' },
}

const STATUS_CONFIG = {
  abierta: { label: 'Abierta', color: '#f59e0b' },
  en_proceso: { label: 'En proceso', color: '#3b82f6' },
  resuelta: { label: 'Resuelta', color: '#10b981' },
  cerrada: { label: 'Cerrada', color: '#64748b' },
}

function formatDate(dateValue) {
  if (!dateValue) return ''
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function IncidentCard({ incident, token, onLocate, onStatusChange, onCall, onArchive, isStaff = false }) {
  const [isUpdating, setIsUpdating] = useState(false)
  const priority = PRIORITY_CONFIG[incident.priority] || PRIORITY_CONFIG.BAJA
  const status = STATUS_CONFIG[incident.status] || STATUS_CONFIG.abierta
  const isHotspot = incident.triageMetadata?.isHotspot

  const handleNextStatus = async () => {
    if (!onStatusChange || isUpdating) return
    setIsUpdating(true)
    try {
      const nextStatusMap = {
        abierta: 'en_proceso',
        en_proceso: 'resuelta',
        resuelta: 'cerrada',
      }
      const next = nextStatusMap[incident.status]
      if (next) {
        await onStatusChange(incident.id, next)
      }
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <article className="incident-card-premium" aria-label={`Incidencia: ${incident.title}`}>
      <div>
        <div className="incident-card-header">
          <span className="incident-card-category">{incident.categoryName || incident.category}</span>
          <div className="incident-card-badges">
            {isHotspot && (
              <span className="hotspot-pill" title="Zona caliente: Múltiples reportes detectados en 150m">
                🔥 Hotspot
              </span>
            )}
            <span className={`priority-badge ${priority.className}`}>
              <span className="priority-dot" />
              {priority.label}
            </span>
          </div>
        </div>

        <h3 className="incident-card-title">{incident.title}</h3>
        <p className="incident-card-description">{incident.description}</p>
        {!isStaff && <>
          <p>Folio: {incident.id}</p>
          <p>{describeIncidentStatus(incident.status).next}</p>
        </>}
        {token && <IncidentPhotos incidentId={incident.id} token={token} />}
      </div>

      <div className="incident-card-footer">
        <div className="incident-card-meta">
          <span>{isStaff ? formatDate(incident.createdAt) : `Última actualización: ${formatDate(incident.updatedAt ?? incident.createdAt)}`}</span>
          <span className="incident-card-status-badge">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.color, display: 'inline-block' }} />
            {status.label}
          </span>
          {Number.isFinite(incident.latitude) && onLocate && (
            <button
              type="button"
              className="incident-card-locate"
              onClick={() => onLocate(incident)}
              title="Centrar en el mapa"
            >
              📍 Ubicar
            </button>
          )}
        </div>

        {isStaff && (onCall || onArchive || (incident.status !== 'cerrada' && onStatusChange)) && (
          <div className="incident-card-actions">
            {onCall && (
              <button
                className="button button-secondary button-small"
                onClick={() => onCall(incident)}
                type="button"
              >
                📞 Llamar
              </button>
            )}
            {incident.status !== 'cerrada' && onStatusChange && (
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={isUpdating}
                onClick={handleNextStatus}
              >
                {isUpdating ? 'Actualizando…' : 'Avanzar estado'}
              </button>
            )}
            {onArchive && (
              <button className="button button-secondary button-small" onClick={() => onArchive(incident)} type="button">
                Archivar
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

export default IncidentCard
