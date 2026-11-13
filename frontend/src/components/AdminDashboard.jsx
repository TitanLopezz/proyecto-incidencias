import { useCallback, useEffect, useState } from 'react'
import { createAdmin, listAdmins } from '../api/accounts'
import { archiveIncident, listArchivedIncidents, listIncidents, updateIncident, updateIncidentStatus } from '../api/incidents'
import IncidentMap from './IncidentMaps'
import HeatmapView from './HeatmapView'
import IncidentCard from '../features/incidents/components/IncidentCard'
import LlamarEquipoModal from './LlamarEquipoModal'
import GestionContactos from './GestionContactos'
import IncidentPhotos from './IncidentPhotos'
import IncidentAssignments, { IncidentAssignmentHistory } from './IncidentAssignments'
import '../features/incidents/components/IncidentCard.css'
import './LlamarEquipo.css'

const INCIDENT_STATUSES = [
  { value: 'abierta', label: 'Abierta' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'resuelta', label: 'Resuelta' },
  { value: 'cerrada', label: 'Cerrada' },
]

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

function ArchivedIncidents({ token, onUnauthorized }) {
  const [incidents, setIncidents] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    listArchivedIncidents(token).then((results) => {
      if (active) setIncidents(results)
    }).catch((requestError) => {
      if (!active) return
      if (requestError.status === 401) onUnauthorized()
      else setError(requestError.message)
    })
    return () => { active = false }
  }, [token, onUnauthorized])

  return (
    <section className="panel" aria-labelledby="archived-incidents-title">
      <h2 id="archived-incidents-title">Incidencias archivadas</h2>
      {error && <p className="feedback feedback-error" role="alert">{error}</p>}
      {!error && incidents === null && <p role="status">Cargando incidencias archivadas…</p>}
      {incidents?.length === 0 && <p>Aún no hay incidencias archivadas.</p>}
      {incidents?.map((incident) => (
        <article key={incident.id} className="panel">
          <h3>{incident.title}</h3>
          <p>{incident.description}</p>
          <dl>
            <dt>Folio</dt><dd>{incident.id}</dd>
            <dt>Estado al archivar</dt>
            <dd>{INCIDENT_STATUSES.find((item) => item.value === incident.status)?.label ?? incident.status}</dd>
            <dt>Fecha de archivo</dt><dd>{formatDate(incident.archivedAt)}</dd>
            <dt>Archivó</dt><dd>{incident.archivedByName || incident.archivedBy}</dd>
            <dt>Motivo</dt><dd>{incident.archiveReason}</dd>
          </dl>
          <IncidentPhotos incidentId={incident.id} token={token} readOnly />
          <IncidentAssignmentHistory id={incident.id} token={token} onUnauthorized={onUnauthorized} />
        </article>
      ))}
    </section>
  )
}

function AdminDashboard({ token, user, onLogout }) {
  const [incidents, setIncidents] = useState([])
  const [admins, setAdmins] = useState([])
  const [editIncident, setEditIncident] = useState(null)
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [archiveReason, setArchiveReason] = useState('')
  const [archiveError, setArchiveError] = useState('')
  const [isArchiving, setIsArchiving] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [updatingStatusIds, setUpdatingStatusIds] = useState(() => new Set())
  const [incidentView, setIncidentView] = useState('table')
  const [activeSection, setActiveSection] = useState('incidencias')
  const [llamarModal, setLlamarModal] = useState({ open: false, incident: null })
  const isSuperAdmin = user?.role === 'superadmin'

  const handleRequestError = useCallback((requestError) => {
    if (requestError.status === 401) {
      onLogout()
      return
    }

    setError(requestError.message)
  }, [onLogout])

  useEffect(() => {
    let isActive = true
    Promise.all([
      listIncidents(token),
      isSuperAdmin ? listAdmins(token) : Promise.resolve(null),
    ])
      .then(([incidentResults, adminResults]) => {
        if (!isActive) {
          return
        }

        setIncidents(incidentResults)
        if (adminResults) {
          setAdmins(adminResults)
        }
      })
      .catch((requestError) => {
        if (isActive) {
          handleRequestError(requestError)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [handleRequestError, isSuperAdmin, token])

  function updateDraft(field, value) {
    setEditIncident((current) => ({ ...current, [field]: value }))
  }

  async function saveIncident(event) {
    event.preventDefault()
    if (!editIncident) {
      return
    }

    setIsSaving(true)
    setError('')
    try {
      const updatedIncident = await updateIncident(editIncident.id, {
        title: editIncident.title,
        description: editIncident.description,
        status: editIncident.status,
      }, token)
      setIncidents((current) => current.map((incident) => (
        incident.id === updatedIncident.id ? updatedIncident : incident
      )))
      setEditIncident(null)
      setSuccess('Incidencia actualizada.')
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setIsSaving(false)
    }
  }

  async function changeIncidentStatus(incident, status) {
    setError('')
    setSuccess('')
    setUpdatingStatusIds((current) => new Set(current).add(incident.id))
    try {
      const updatedIncident = await updateIncidentStatus(incident.id, status, token)
      setIncidents((current) => current.map((item) => (
        item.id === updatedIncident.id ? updatedIncident : item
      )))
      setSuccess(`Estado actualizado a «${INCIDENT_STATUSES.find((item) => item.value === status)?.label || status}».`)
      return true
    } catch (requestError) {
      handleRequestError(requestError)
      return false
    } finally {
      setUpdatingStatusIds((current) => {
        const next = new Set(current)
        next.delete(incident.id)
        return next
      })
    }
  }

  function selectArchiveTarget(incident) {
    if (isArchiving) return
    setArchiveTarget(incident)
    setArchiveReason('')
    setArchiveError('')
  }

  async function handleArchive(event) {
    event.preventDefault()
    if (!archiveTarget || !archiveReason.trim() || isArchiving) return
    setIsArchiving(true)
    setArchiveError('')
    setError('')
    try {
      await archiveIncident(archiveTarget.id, archiveReason.trim(), token)
      setIncidents((current) => current.filter((item) => item.id !== archiveTarget.id))
      setSuccess('Incidencia archivada. Puedes consultar el expediente en Archivadas.')
      setArchiveTarget(null)
      setArchiveReason('')
      if (editIncident?.id === archiveTarget.id) {
        setEditIncident(null)
      }
    } catch (requestError) {
      if (requestError.status === 401) onLogout()
      else setArchiveError(requestError.message)
    } finally {
      setIsArchiving(false)
    }
  }

  async function handleCreateAdmin(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setSuccess('')
    try {
      const admin = await createAdmin({ name: adminName, email: adminEmail, password: adminPassword }, token)
      setAdmins((current) => [admin, ...current])
      setAdminName('')
      setAdminEmail('')
      setAdminPassword('')
      setSuccess(`Cuenta de administrador creada para ${admin.email}.`)
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setIsSaving(false)
    }
  }

  function refreshData() {
    setIsLoading(true)
    setError('')
    setSuccess('')
    Promise.all([
      listIncidents(token),
      isSuperAdmin ? listAdmins(token) : Promise.resolve(null),
    ])
      .then(([incidentResults, adminResults]) => {
        setIncidents(incidentResults)
        if (adminResults) {
          setAdmins(adminResults)
        }
      })
      .catch(handleRequestError)
      .finally(() => setIsLoading(false))
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">PORTAL DE ADMINISTRACIÓN</p>
          <h1>{isSuperAdmin ? 'Superadministración' : 'Gestión de reportes'}</h1>
          <p className="welcome-message">
            {user?.name || 'Personal'} · {isSuperAdmin ? 'Superadministrador' : 'Administrador'}
          </p>
        </div>
        <button className="button button-secondary" onClick={onLogout} type="button">
          Cerrar sesión
        </button>
      </header>

      {/* Section tabs */}
      <div className="incident-view-controls" role="tablist" style={{ marginBottom: 20 }}>
        <button
          role="tab"
          aria-selected={activeSection === 'incidencias'}
          className={`button ${activeSection === 'incidencias' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setActiveSection('incidencias')}
          type="button"
        >
          📋 Incidencias
        </button>
        <button
          role="tab"
          aria-selected={activeSection === 'asignaciones'}
          className={`button ${activeSection === 'asignaciones' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setActiveSection('asignaciones')}
          type="button"
        >
          Asignaciones
        </button>
        <button
          role="tab"
          aria-selected={activeSection === 'archivadas'}
          className={`button ${activeSection === 'archivadas' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setActiveSection('archivadas')}
          type="button"
        >
          Archivadas
        </button>
        <button
          role="tab"
          aria-selected={activeSection === 'contactos'}
          className={`button ${activeSection === 'contactos' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setActiveSection('contactos')}
          type="button"
        >
          👥 Equipos y contactos
        </button>
      </div>

      {activeSection === 'archivadas' && <ArchivedIncidents token={token} onUnauthorized={onLogout} />}
      {activeSection === 'asignaciones' && <IncidentAssignments token={token} onUnauthorized={onLogout} />}

      {/* ── SECCIÓN INCIDENCIAS ───────────────────────────────────────── */}
      {activeSection === 'incidencias' && (
        <>
          {archiveTarget && (
            <section className="panel" aria-labelledby="archive-incident-title">
              <h2 id="archive-incident-title">Archivar «{archiveTarget.title}»</h2>
              <p>El expediente saldrá de la lista activa y quedará disponible para el personal.</p>
              {archiveError && <p className="feedback feedback-error" role="alert">{archiveError}</p>}
              <form className="incident-form" onSubmit={handleArchive}>
                <label htmlFor="archive-reason">Motivo del archivo</label>
                <textarea
                  autoFocus
                  disabled={isArchiving}
                  id="archive-reason"
                  maxLength={500}
                  onChange={(event) => setArchiveReason(event.target.value)}
                  required
                  value={archiveReason}
                />
                <div className="citizen-header-actions">
                  <button className="button button-primary" disabled={isArchiving || !archiveReason.trim()} type="submit">
                    {isArchiving ? 'Archivando…' : 'Confirmar archivo'}
                  </button>
                  <button className="button button-secondary" disabled={isArchiving} onClick={() => setArchiveTarget(null)} type="button">
                    Cancelar
                  </button>
                </div>
              </form>
            </section>
          )}
          {isSuperAdmin && (
            <section aria-labelledby="create-admin-title" className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">ACCESO DEL EQUIPO</p>
                  <h2 id="create-admin-title">Crear cuenta de administrador</h2>
                </div>
              </div>
              <form className="admin-create-form" onSubmit={handleCreateAdmin}>
                <label htmlFor="admin-name">Nombre</label>
                <input
                  autoComplete="name"
                  id="admin-name"
                  maxLength={100}
                  onChange={(event) => setAdminName(event.target.value)}
                  required
                  value={adminName}
                />
                <label htmlFor="admin-email">Correo electrónico</label>
                <input
                  autoComplete="email"
                  id="admin-email"
                  onChange={(event) => setAdminEmail(event.target.value)}
                  required
                  type="email"
                  value={adminEmail}
                />
                <label htmlFor="admin-password">Contraseña temporal</label>
                <input
                  autoComplete="new-password"
                  id="admin-password"
                  minLength={8}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  required
                  type="password"
                  value={adminPassword}
                />
                <div className="form-footer">
                  <p className="field-hint">La cuenta tendrá permisos de administrador, nunca de superadministrador.</p>
                  <button className="button button-primary" disabled={isSaving} type="submit">
                    Crear administrador
                  </button>
                </div>
              </form>
            </section>
          )}

          {isSuperAdmin && (
            <section aria-labelledby="admin-list-title" className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">CUENTAS DEL EQUIPO</p>
                  <h2 id="admin-list-title">Administradores</h2>
                </div>
              </div>
              {admins.length === 0 ? (
                <p className="empty-state">Aún no hay administradores. Crea la primera cuenta desde el formulario.</p>
              ) : (
                <ul className="admin-list">
                  {admins.map((admin) => (
                    <li key={admin.id}>
                      <span className="admin-avatar" aria-hidden="true">
                        {admin.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="admin-identity">
                        <strong>{admin.name}</strong>
                        <span>{admin.email}</span>
                      </span>
                      <span className="status-badge">Administrador</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section aria-labelledby="staff-incidents-title" className="panel">
            <div className="panel-heading incident-list-heading">
              <div>
                <p className="eyebrow">REPORTES CIUDADANOS</p>
                <h2 id="staff-incidents-title">Todas las incidencias</h2>
              </div>
              <div className="incident-view-controls" role="group" aria-label="Vista de incidencias">
                <button
                  aria-pressed={incidentView === 'table'}
                  className={`button ${incidentView === 'table' ? 'button-primary' : 'button-secondary'}`}
                  onClick={() => setIncidentView('table')}
                  type="button"
                >
                  Tabla de incidencias
                </button>
                <button
                  aria-pressed={incidentView === 'cards'}
                  className={`button ${incidentView === 'cards' ? 'button-primary' : 'button-secondary'}`}
                  onClick={() => setIncidentView('cards')}
                  type="button"
                >
                  Tarjetas
                </button>
                <button
                  aria-pressed={incidentView === 'heatmap'}
                  className={`button ${incidentView === 'heatmap' ? 'button-primary' : 'button-secondary'}`}
                  onClick={() => setIncidentView('heatmap')}
                  type="button"
                >
                  Mapa de calor
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => setLlamarModal({ open: true, incident: null })}
                  type="button"
                  title="Ver contactos del equipo y registrar un aviso"
                >
                  📞 Llamar al equipo
                </button>
              </div>
              <button
                className="button button-secondary"
                disabled={isLoading}
                onClick={refreshData}
                type="button"
              >
                Actualizar
              </button>
            </div>

            {error && <p className="feedback feedback-error" role="alert">{error}</p>}
            {success && <p className="feedback feedback-success" role="status">{success}</p>}

            {incidentView === 'heatmap' ? (
              <HeatmapView onLogout={onLogout} token={token} />
            ) : incidentView === 'cards' ? (
              <>
                <IncidentMap incidents={incidents} staffView />
                {isLoading ? (
                  <p className="empty-state">Cargando reportes…</p>
                ) : incidents.length === 0 ? (
                  <p className="empty-state">Todavía no hay reportes ciudadanos.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px', marginTop: '20px' }}>
                    {incidents.map((incident) => (
                      <div key={incident.id} style={{ position: 'relative' }}>
                        <IncidentCard
                          incident={incident}
                          token={token}
                          isStaff
                          onArchive={selectArchiveTarget}
                          onCall={(selectedIncident) => setLlamarModal({ open: true, incident: selectedIncident })}
                          onStatusChange={(id, newStatus) => {
                            const inc = incidents.find((item) => item.id === id)
                            if (inc) changeIncidentStatus(inc, newStatus)
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <IncidentMap incidents={incidents} staffView />
                {isLoading ? (
                  <p className="empty-state">Cargando reportes…</p>
                ) : incidents.length === 0 ? (
                  <p className="empty-state">Todavía no hay reportes ciudadanos.</p>
                ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Incidencia</th>
                      <th scope="col">Prioridad</th>
                      <th scope="col">Reportada por</th>
                      <th scope="col">Descripción</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Fecha</th>
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((incident) => (
                      <tr key={incident.id}>
                        {editIncident?.id === incident.id ? (
                          <td colSpan={7}>
                            <form className="incident-edit-form" onSubmit={saveIncident}>
                              <label>
                                Título
                                <input
                                  maxLength={150}
                                  onChange={(event) => updateDraft('title', event.target.value)}
                                  required
                                  value={editIncident.title}
                                />
                              </label>
                              <label>
                                Descripción
                                <textarea
                                  maxLength={2000}
                                  onChange={(event) => updateDraft('description', event.target.value)}
                                  required
                                  rows={3}
                                  value={editIncident.description}
                                />
                              </label>
                              <label>
                                Estado
                                <select
                                  onChange={(event) => updateDraft('status', event.target.value)}
                                  value={editIncident.status}
                                >
                                  {INCIDENT_STATUSES.map((status) => (
                                    <option key={status.value} value={status.value}>{status.label}</option>
                                  ))}
                                </select>
                              </label>
                              <div className="edit-actions">
                                <button className="button button-secondary" onClick={() => setEditIncident(null)} type="button">
                                  Cancelar
                                </button>
                                <button className="button button-primary" disabled={isSaving} type="submit">
                                  Guardar cambios
                                </button>
                              </div>
                            </form>
                          </td>
                        ) : (
                          <>
                            <td className="incident-title-cell">{incident.title}</td>
                            <td>
                              <span className={`priority-badge priority-${(incident.priority || 'baja').toLowerCase()}`}>
                                <span className="priority-dot" />
                                {incident.priority || 'BAJA'}
                              </span>
                              {incident.triageMetadata?.isHotspot && (
                                <span className="hotspot-pill" style={{ marginLeft: 6 }} title="Punto de recurrencia">
                                  🔥
                                </span>
                              )}
                            </td>
                            <td>
                              <div className="reporter-cell">
                                <strong>{incident.reporter?.name || 'Cuenta no disponible'}</strong>
                                {incident.reporter?.email && <span>{incident.reporter.email}</span>}
                              </div>
                            </td>
                            <td className="incident-description-cell">{incident.description}<IncidentPhotos incidentId={incident.id} token={token} /></td>
                            <td>
                              <div className="incident-status-cell">
                                <span className="status-badge">
                                  {INCIDENT_STATUSES.find((status) => status.value === incident.status)?.label || incident.status}
                                </span>
                                <select
                                  aria-label={`Cambiar estado de ${incident.title}`}
                                  className="status-control"
                                  disabled={updatingStatusIds.has(incident.id)}
                                  onChange={(event) => changeIncidentStatus(incident, event.target.value)}
                                  value={incident.status}
                                >
                                  {INCIDENT_STATUSES.map((status) => (
                                    <option key={status.value} value={status.value}>{status.label}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="date-cell">{formatDate(incident.createdAt)}</td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="button button-secondary button-small"
                                  onClick={() => {
                                    setError('')
                                    setSuccess('')
                                    setEditIncident({
                                      id: incident.id,
                                      title: incident.title,
                                      description: incident.description,
                                      status: incident.status,
                                    })
                                  }}
                                  type="button"
                                >
                                  Editar
                                </button>
                                <button
                                  className="button button-secondary button-small"
                                  onClick={() => setLlamarModal({ open: true, incident })}
                                  type="button"
                                  title="Llamar al equipo para esta incidencia"
                                >
                                  📞 Llamar
                                </button>
                                <button
                                  className="button button-danger button-small"
                                  onClick={() => selectArchiveTarget(incident)}
                                  type="button"
                                >
                                  Archivar
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
                )}
              </>
            )}
          </section>
        </>
      )}

      {/* ── SECCIÓN EQUIPOS Y CONTACTOS ───────────────────────────────── */}
      {activeSection === 'contactos' && (
        <GestionContactos token={token} />
      )}

      {/* ── MODAL LLAMAR AL EQUIPO ────────────────────────────────────── */}
      {llamarModal.open && (
        <LlamarEquipoModal
          token={token}
          incident={llamarModal.incident}
          onClose={() => setLlamarModal({ open: false, incident: null })}
          onIncidentStatusChange={async (id, newStatus) => {
            const inc = incidents.find((item) => item.id === id)
            if (inc) await changeIncidentStatus(inc, newStatus)
          }}
        />
      )}
    </main>
  )
}

export default AdminDashboard
