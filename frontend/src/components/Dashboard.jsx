import { useCallback, useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { API_BASE_URL } from '../api/client'
import { listIncidents } from '../api/incidents'
import { listNotifications, markNotificationRead } from '../api/notifications'
import CreateIncidentForm from './CreateIncidentForm'
import IncidentMap from './IncidentMaps'
import IncidentCard from '../features/incidents/components/IncidentCard'
import { describeIncidentStatus } from '../features/incidents/status'
import IncidentPhotos from './IncidentPhotos'
import TelegramAccount from './TelegramAccount'

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible'
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function mergeNotifications(current, incoming) {
  const byId = new Map(current.map((notification) => [notification.id, notification]))
  incoming.forEach((notification) => byId.set(notification.id, notification))

  return [...byId.values()].sort(
    (first, second) => new Date(second.createdAt) - new Date(first.createdAt),
  )
}

function Dashboard({ token, user, onLogout }) {
  const [incidents, setIncidents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [notifications, setNotifications] = useState([])
  const [areNotificationsLoading, setAreNotificationsLoading] = useState(true)
  const [notificationError, setNotificationError] = useState('')
  const [updatingNotificationIds, setUpdatingNotificationIds] = useState(() => new Set())
  const [viewMode, setViewMode] = useState('cards')
  const notificationErrorMessage = API_BASE_URL
    ? notificationError
    : 'VITE_API_URL no está configurada; no se pueden cargar notificaciones.'

  const handleRequestError = useCallback((requestError) => {
    if (requestError.status === 401) {
      onLogout()
      return
    }

    setError(requestError.message)
  }, [onLogout])

  useEffect(() => {
    listIncidents(token)
      .then(setIncidents)
      .catch(handleRequestError)
      .finally(() => setIsLoading(false))
  }, [handleRequestError, token])

  useEffect(() => {
    let isActive = true
    listNotifications(token)
      .then((results) => {
        if (isActive) {
          setNotifications((current) => mergeNotifications(current, results))
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
        setNotificationError(requestError.message)
      })
      .finally(() => {
        if (isActive) {
          setAreNotificationsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [onLogout, token])

  useEffect(() => {
    if (!API_BASE_URL) {
      return undefined
    }

    const socketOrigin = new URL(
      API_BASE_URL,
      window.location.origin,
    ).origin
    const socket = io(socketOrigin, {
      autoConnect: false,
      auth: { token },
    })

    socket.on('connect', () => {
      setNotificationError('')
    })
    socket.on('new_notification', (notification) => {
      setNotifications((current) => mergeNotifications(current, [notification]))
    })
    socket.on('incident_status_updated', (updatedIncident) => {
      setIncidents((current) => current.map((item) => (
        item.id === updatedIncident.id
          && new Date(updatedIncident.updatedAt) >= new Date(item.updatedAt ?? item.createdAt)
          ? { ...item, ...updatedIncident } : item
      )))
    })
    socket.io.on('reconnect', () => {
      listNotifications(token)
        .then(results => setNotifications(current => mergeNotifications(current, results)))
        .catch(() => setNotificationError('No se pudieron sincronizar las notificaciones.'))
      listIncidents(token).then(setIncidents).catch(() => setError('No se pudieron sincronizar las incidencias.'))
    })
    socket.on('connect_error', (connectionError) => {
      setNotificationError(`No se pudo conectar para recibir notificaciones en tiempo real: ${connectionError.message}`)
    })
    socket.connect()

    return () => {
      socket.disconnect()
    }
  }, [token])

  async function markNotificationAsRead(notification) {
    setNotificationError('')
    setUpdatingNotificationIds((current) => new Set(current).add(notification.id))
    try {
      const updatedNotification = await markNotificationRead(notification.id, token)
      setNotifications((current) => current.map((item) => (
        item.id === updatedNotification.id ? updatedNotification : item
      )))
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout()
      } else {
        setNotificationError(requestError.message)
      }
    } finally {
      setUpdatingNotificationIds((current) => {
        const next = new Set(current)
        next.delete(notification.id)
        return next
      })
    }
  }

  function handleRefresh() {
    setIsLoading(true)
    setError('')
    listIncidents(token)
      .then(setIncidents)
      .catch(handleRequestError)
      .finally(() => setIsLoading(false))
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">SISTEMA DE GESTIÓN</p>
          <h1>Incidencias</h1>
          <p className="welcome-message">Hola, {user?.name || 'Ciudadano'}</p>
        </div>
        <button className="button button-secondary" onClick={onLogout} type="button">
          Cerrar sesión
        </button>
      </header>

      <TelegramAccount token={token} onUnauthorized={onLogout} />

      <section aria-labelledby="notifications-title" className="panel notifications-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ACTUALIZACIONES</p>
            <h2 id="notifications-title">
              Notificaciones
              {notifications.some((notification) => !notification.isRead) && (
                <span className="notification-count">
                  {notifications.filter((notification) => !notification.isRead).length} sin leer
                </span>
              )}
            </h2>
          </div>
        </div>

        {notificationErrorMessage && (
          <p className="feedback feedback-error" role="alert">{notificationErrorMessage}</p>
        )}
        {areNotificationsLoading ? (
          <p className="empty-state">Cargando notificaciones…</p>
        ) : notifications.length === 0 ? (
          <p className="empty-state">No tienes notificaciones por el momento.</p>
        ) : (
          <ul className="notification-list">
            {notifications.map((notification) => (
              <li
                className={notification.isRead ? 'notification-item' : 'notification-item notification-unread'}
                key={notification.id}
              >
                <div>
                  <p>{notification.message}</p>
                  <time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time>
                </div>
                {!notification.isRead && (
                  <button
                    className="button button-secondary button-small"
                    disabled={updatingNotificationIds.has(notification.id)}
                    onClick={() => markNotificationAsRead(notification)}
                    type="button"
                  >
                    Marcar como leída
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateIncidentForm
        onCreated={(incident) => setIncidents((current) => [incident, ...current])}
        onUnauthorized={onLogout}
        token={token}
      />

      <section aria-label="Mapa de tus incidencias" className="panel">
        <IncidentMap incidents={incidents} />
      </section>

      <section aria-labelledby="incident-list-title" className="panel">
        <div className="panel-heading incident-list-heading">
          <div>
            <p className="eyebrow">SEGUIMIENTO</p>
            <h2 id="incident-list-title">Incidencias registradas</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div className="view-mode-toggle" style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '8px', padding: '2px' }}>
              <button
                type="button"
                className={`button ${viewMode === 'cards' ? 'button-primary' : 'button-secondary'}`}
                style={{ padding: '6px 12px', fontSize: '12px', minWidth: 'auto', border: 'none' }}
                onClick={() => setViewMode('cards')}
              >
                Tarjetas
              </button>
              <button
                type="button"
                className={`button ${viewMode === 'table' ? 'button-primary' : 'button-secondary'}`}
                style={{ padding: '6px 12px', fontSize: '12px', minWidth: 'auto', border: 'none' }}
                onClick={() => setViewMode('table')}
              >
                Tabla
              </button>
            </div>
            <button
              aria-label="Actualizar incidencias"
              className="button button-secondary"
              disabled={isLoading}
              onClick={handleRefresh}
              type="button"
            >
              Actualizar
            </button>
          </div>
        </div>

        {error && <p className="feedback feedback-error" role="alert">{error}</p>}
        {isLoading ? (
          <p className="empty-state">Cargando incidencias…</p>
        ) : incidents.length === 0 ? (
          <p className="empty-state">Todavía no hay incidencias registradas.</p>
        ) : viewMode === 'cards' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {incidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} token={token} />
            ))}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Incidencia</th>
                  <th scope="col">Descripción</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Última actualización</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td className="incident-title-cell">{incident.title}<p>Folio: {incident.id}</p></td>
                    <td className="incident-description-cell">{incident.description}<IncidentPhotos incidentId={incident.id} token={token} /></td>
                    <td>
                      <span className="status-badge">{describeIncidentStatus(incident.status).label}</span>
                      <p>{describeIncidentStatus(incident.status).next}</p>
                    </td>
                    <td className="date-cell">{formatDate(incident.updatedAt ?? incident.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

export default Dashboard
