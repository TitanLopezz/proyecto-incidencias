import { useCallback, useEffect, useRef, useState } from 'react'
import { assignIncident, listIncidentAssignmentHistory, listIncidentAssignments } from '../api/incidents'
import { listContacts } from '../api/team'
import { describeIncidentStatus } from '../features/incidents/status'

const dateFormat = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City',
})

const filters = [
  { value: 'active', label: 'Activas', matches: item => item.isActive },
  { value: 'unassigned', label: 'Por asignar', matches: item => item.needsAssignment },
  { value: 'open', label: 'Abiertas', matches: item => item.status === 'abierta' },
  { value: 'in-progress', label: 'En proceso', matches: item => item.status === 'en_proceso' },
  { value: 'overdue', label: 'Vencidas', matches: item => item.overdue },
  { value: 'escalated', label: 'Para supervisión', matches: item => item.escalated },
  { value: 'completed', label: 'Resueltas o cerradas', matches: item => !item.isActive },
]

function formatDate(value) {
  return value ? dateFormat.format(new Date(value)) : 'Pendiente'
}

export function IncidentAssignmentHistory({ id, token, onUnauthorized }) {
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function toggleHistory() {
    if (history) {
      setHistory(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      setHistory(await listIncidentAssignmentHistory(id, token))
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized()
      else setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button className="button button-secondary" type="button" disabled={loading} onClick={toggleHistory} aria-expanded={history !== null}>
        {loading ? 'Cargando historial…' : history ? 'Ocultar historial de asignaciones' : 'Ver historial de asignaciones'}
      </button>
      {error && <p className="feedback feedback-error" role="alert">{error}</p>}
      {history?.length === 0 && <p>Aún no hay asignaciones.</p>}
      {history?.length > 0 && (
        <ol>
          {history.map(entry => <li key={entry.id}>{formatDate(entry.assignedAt)} · {entry.teamName} · {entry.contactName} · Asignó {entry.assignedBy}</li>)}
        </ol>
      )}
    </div>
  )
}

function AssignmentItem({ incident, contacts, token, onAssigned, onUnauthorized }) {
  const [contactId, setContactId] = useState(incident.contactAvailable ? incident.contactId : '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await assignIncident(incident.id, contactId, token)
      setMessage('Asignación guardada.')
      await onAssigned()
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized()
      else setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="panel">
      <h3>{incident.title}</h3>
      <p>{describeIncidentStatus(incident.status).label} · Folio {incident.id}</p>
      <dl>
        <dt>Recepción</dt><dd>{formatDate(incident.receivedAt)}</dd>
        <dt>Última asignación</dt><dd>{formatDate(incident.assignedAt)}</dd>
        <dt>Cuadrilla responsable</dt>
        <dd>{incident.teamName ? `${incident.teamName} · ${incident.contactName}` : 'Sin asignar'}</dd>
        {incident.needsAssignment && incident.assignedAt && <dd>El contacto ya no está disponible. Reasigna el folio.</dd>}
        <dt>Plazo de atención</dt><dd>{formatDate(incident.dueAt)}</dd>
      </dl>
      {incident.overdue && <p><strong>Vencida</strong>{incident.escalated && ' · Requiere revisión de supervisión'}</p>}
      {incident.isActive && <form className="incident-form" onSubmit={save}>
        <label htmlFor={`assignment-${incident.id}`}>Contacto de cuadrilla</label>
        <select id={`assignment-${incident.id}`} value={contactId} disabled={busy} onChange={event => setContactId(event.target.value)}>
          <option value="">Selecciona un contacto activo</option>
          {contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.equipo} · {contact.nombre}</option>)}
        </select>
        <button className="button button-primary" type="submit" disabled={busy || !contactId || contactId === incident.contactId}>
          {incident.assignedAt ? 'Reasignar' : 'Asignar'}
        </button>
      </form>}
      <IncidentAssignmentHistory key={incident.assignedAt ?? incident.id} id={incident.id} token={token} onUnauthorized={onUnauthorized} />
      {message && <p role="status">{message}</p>}
      {error && <p className="feedback feedback-error" role="alert">{error}</p>}
    </article>
  )
}

export default function IncidentAssignments({ token, onUnauthorized }) {
  const [items, setItems] = useState([])
  const [contacts, setContacts] = useState([])
  const [filter, setFilter] = useState('active')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const refresh = useCallback(() => {
    const currentRequest = ++requestId.current
    return Promise.all([
      listIncidentAssignments(token), listContacts(token, { activeOnly: true }),
    ]).then(([assignments, activeContacts]) => {
      if (currentRequest !== requestId.current) return
      setItems(assignments)
      setContacts(activeContacts)
      setError('')
    }).catch((requestError) => {
      if (currentRequest !== requestId.current) return
      if (requestError.status === 401) onUnauthorized()
      else setError(requestError.message)
    }).finally(() => {
      if (currentRequest === requestId.current) setLoading(false)
    })
  }, [onUnauthorized, token])

  useEffect(() => {
    refresh()
    return () => { requestId.current += 1 }
  }, [refresh])

  function reload() {
    setLoading(true)
    setError('')
    return refresh()
  }
  const shown = items.filter(filters.find(option => option.value === filter).matches)

  return (
    <section className="panel" aria-labelledby="assignment-title">
      <h2 id="assignment-title">Asignación y plazos</h2>
      <p>Revisa los folios abiertos o en proceso y asigna un responsable de atención.</p>
      <div className="citizen-header-actions">
        <label htmlFor="assignment-filter">Mostrar</label>
        <select id="assignment-filter" value={filter} onChange={event => setFilter(event.target.value)}>
          {filters.map(option => <option key={option.value} value={option.value}>{option.label} ({items.filter(option.matches).length})</option>)}
        </select>
        <button className="button button-secondary" type="button" onClick={reload} disabled={loading}>Actualizar</button>
      </div>
      {loading && <p role="status">Cargando asignaciones…</p>}
      {error && <p className="feedback feedback-error" role="alert">{error}</p>}
      {!loading && !error && shown.length === 0 && <p>No hay folios en este filtro.</p>}
      {shown.map(incident => (
        <AssignmentItem key={incident.id} incident={incident} contacts={contacts} token={token} onAssigned={reload} onUnauthorized={onUnauthorized} />
      ))}
    </section>
  )
}
