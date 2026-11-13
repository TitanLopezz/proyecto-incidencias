import { useEffect, useState } from 'react'
import { createCall, listCalls, listContacts } from '../api/team'

const TIPOS_LABEL = {
  bache: 'Bache',
  alumbrado: 'Alumbrado público',
  basura: 'Basura',
}

/**
 * Modal para llamar/contactar al equipo de atención.
 *
 * Props:
 *  - token: string
 *  - onClose: () => void
 *  - incident: objeto incidencia (opcional, cuando se abre desde una fila)
 *  - onIncidentStatusChange: (id, nuevoEstado) => void (opcional)
 */
export default function LlamarEquipoModal({ token, onClose, incident, onIncidentStatusChange }) {
  const [contactos, setContactos] = useState([])
  const [llamadas, setLlamadas] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [enviando, setEnviando] = useState(null) // id del contacto en curso

  const incidentId = incident?.id

  useEffect(() => {
    let isActive = true
    Promise.all([
      listContacts(token, { activeOnly: true }),
      listCalls(token, incidentId),
    ])
      .then(([contactosData, llamadasData]) => {
        if (!isActive) return
        setContactos(contactosData || [])
        setLlamadas(llamadasData || [])
      })
      .catch((err) => {
        if (isActive) setError(err.message)
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })
    return () => {
      isActive = false
    }
  }, [token, incidentId])

  // Contactos sugeridos = los que atienden el tipo de incidencia seleccionada
  const contactosSugeridos = incident?.category
    ? contactos.filter((c) => c.tipoIncidencia === incident.category)
    : []
  const otrosContactos = contactos.filter(
    (c) => !contactosSugeridos.some((s) => s.id === c.id),
  )

  function buildWhatsAppMessage(contacto) {
    if (!incident) return ''
    const estado = { abierta: 'Abierta', en_proceso: 'En proceso', resuelta: 'Resuelta', cerrada: 'Cerrada' }
    return encodeURIComponent(
      `Hola ${contacto.nombre}, te contactamos desde el Sistema de Reportes Ciudadanos.\n\n` +
      `📋 *Incidencia:* ${incident.title}\n` +
      `🏷️ *Tipo:* ${TIPOS_LABEL[incident.category] || incident.category || 'Sin categoría'}\n` +
      `📍 *Ubicación:* ${incident.latitude != null && incident.longitude != null
        ? `${Number(incident.latitude).toFixed(5)}, ${Number(incident.longitude).toFixed(5)}`
        : 'No especificada'}\n` +
      `⚡ *Estado:* ${estado[incident.status] || incident.status}\n` +
      `📝 *Descripción:* ${incident.description || ''}\n\n` +
      `Por favor, atiende esta incidencia a la brevedad. Gracias.`,
    )
  }

  async function registrarLlamada(contacto, canal) {
    setEnviando(`${contacto.id}-${canal}`)
    setError('')
    setSuccess('')
    try {
      const llamada = await createCall({
        incident_id: incident?.id || null,
        contacto_id: contacto.id,
        canal,
        notas: incident ? `Aviso por ${canal} sobre: ${incident.title}` : `Aviso por ${canal}`,
      }, token)
      setSuccess(`✅ Aviso registrado: ${contacto.nombre} (${canal === 'whatsapp' ? 'WhatsApp' : 'Teléfono'})`)
      setLlamadas((current) => [llamada, ...current])
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setEnviando(null)
    }
  }

  async function handlePhoneCall(event, contacto) {
    event.preventDefault()
    if (enviando) return
    if (await registrarLlamada(contacto, 'telefono')) {
      window.location.href = `tel:${contacto.telefono}`
    }
  }

  async function handleWhatsApp(event, contacto, url) {
    event.preventDefault()
    if (enviando) return
    const whatsappWindow = window.open('about:blank', '_blank')
    if (whatsappWindow) {
      whatsappWindow.opener = null
    }
    const registered = await registrarLlamada(contacto, 'whatsapp')
    if (!registered) {
      whatsappWindow?.close()
      return
    }
    if (whatsappWindow) {
      whatsappWindow.location.href = url
    } else {
      window.location.href = url
    }
  }

  async function marcarEnProceso() {
    if (!incident || !onIncidentStatusChange) return
    try {
      const updated = await onIncidentStatusChange(incident.id, 'en_proceso')
      if (!updated) return
      setSuccess('✅ Estado cambiado a "En proceso".')
    } catch (err) {
      setError(err.message)
    }
  }

  function ContactoRow({ contacto, sugerido }) {
    const enCurso = Boolean(enviando)
    const whatsappMsg = buildWhatsAppMessage(contacto)
    const cleanPhone = contacto.telefono.replace(/\D/g, '')
    const whatsappUrl = incident
      ? `https://wa.me/${cleanPhone}?text=${whatsappMsg}`
      : `https://wa.me/${cleanPhone}`

    return (
      <li className={`llamada-modal-contacto${sugerido ? ' llamada-modal-contacto--sugerido' : ''}`}>
        <div className="llamada-modal-contacto-info">
          <span className="llamada-modal-avatar" aria-hidden="true">
            {contacto.nombre.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{contacto.nombre}</strong>
            <span className="llamada-modal-equipo">{contacto.equipo}</span>
            {contacto.tipoIncidenciaNombre && (
              <span className="llamada-modal-tipo">{contacto.tipoIncidenciaNombre}</span>
            )}
            {contacto.horario && (
              <span className="llamada-modal-horario">🕐 {contacto.horario}</span>
            )}
          </div>
          {sugerido && (
            <span className="llamada-modal-sugerido-badge">Recomendado</span>
          )}
        </div>
        <div className="llamada-modal-acciones">
          <a
            className="button button-primary button-small"
            href={`tel:${contacto.telefono}`}
            onClick={(event) => handlePhoneCall(event, contacto)}
            aria-disabled={enCurso}
          >
            📞 Llamar
          </a>
          <a
            className="button button-secondary button-small llamada-whatsapp"
            href={whatsappUrl}
            onClick={(event) => handleWhatsApp(event, contacto, whatsappUrl)}
            rel="noopener noreferrer"
            aria-disabled={enCurso}
          >
            💬 WhatsApp
          </a>
        </div>
      </li>
    )
  }

  function formatDate(value) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(date)
  }

  const incidentLocation = incident?.latitude != null && incident?.longitude != null
    ? `${Number(incident.latitude).toFixed(4)}, ${Number(incident.longitude).toFixed(4)}`
    : 'Ubicación no especificada'

  return (
    <div className="llamada-modal-overlay" role="dialog" aria-modal="true" aria-label="Llamar al equipo">
      <div className="llamada-modal">
        {/* Header */}
        <div className="llamada-modal-header">
          <div>
            <p className="eyebrow">EQUIPO DE ATENCIÓN</p>
            <h2>Llamar al equipo</h2>
          </div>
          <button className="button button-secondary button-small" onClick={onClose} type="button">
            ✕ Cerrar
          </button>
        </div>

        {/* Resumen de incidencia (si viene de una) */}
        {incident && (
          <div className="llamada-modal-incidencia">
            <p className="eyebrow">INCIDENCIA SELECCIONADA</p>
            <div className="llamada-modal-incidencia-info">
              <strong>{incident.title}</strong>
              <span className="status-badge">{
                { abierta: 'Abierta', en_proceso: 'En proceso', resuelta: 'Resuelta', cerrada: 'Cerrada' }[incident.status] || incident.status
              }</span>
            </div>
            <p className="llamada-modal-incidencia-desc">
              {TIPOS_LABEL[incident.category] || incident.category || 'Tipo no especificado'}
              {' · '}{incidentLocation}
            </p>
            {incident.status === 'abierta' && onIncidentStatusChange && (
              <button
                className="button button-secondary button-small"
                onClick={marcarEnProceso}
                type="button"
                style={{ marginTop: 8 }}
              >
                Marcar como "En proceso"
              </button>
            )}
          </div>
        )}

        {error && <p className="feedback feedback-error" role="alert">{error}</p>}
        {success && <p className="feedback feedback-success" role="status">{success}</p>}

        {isLoading ? (
          <p className="empty-state">Cargando contactos…</p>
        ) : contactos.length === 0 ? (
          <p className="empty-state">No hay contactos activos. Agrega contactos en "Equipos y contactos".</p>
        ) : (
          <>
            {/* Sugeridos */}
            {contactosSugeridos.length > 0 && (
              <section className="llamada-modal-seccion">
                <p className="llamada-modal-seccion-titulo">✨ Equipos recomendados para este tipo de incidencia</p>
                <ul className="llamada-modal-lista">
                  {contactosSugeridos.map((c) => (
                    <ContactoRow key={c.id} contacto={c} sugerido />
                  ))}
                </ul>
              </section>
            )}

            {/* Todos los demás */}
            {otrosContactos.length > 0 && (
              <section className="llamada-modal-seccion">
                {contactosSugeridos.length > 0 && (
                  <p className="llamada-modal-seccion-titulo">Otros equipos disponibles</p>
                )}
                <ul className="llamada-modal-lista">
                  {otrosContactos.map((c) => (
                    <ContactoRow key={c.id} contacto={c} sugerido={false} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {/* Historial de avisos */}
        {llamadas.length > 0 && (
          <section className="llamada-modal-seccion llamada-modal-historial">
            <p className="llamada-modal-seccion-titulo">📋 Historial de avisos{incident ? ' de esta incidencia' : ''}</p>
            <ul className="llamada-modal-historial-lista">
              {llamadas.map((l) => (
                <li key={l.id} className="llamada-modal-historial-item">
                  <span>{l.canal === 'whatsapp' ? '💬' : '📞'} <strong>{l.contacto.nombre}</strong> — {l.contacto.equipo}</span>
                  <span className="llamada-modal-historial-meta">
                    {l.admin?.nombre && `Por: ${l.admin.nombre} · `}{formatDate(l.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
