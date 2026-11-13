import { useEffect, useState } from 'react'
import { deleteContact, listContacts, saveContact } from '../api/team'

const TIPOS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'bache', label: 'Bache' },
  { value: 'alumbrado', label: 'Alumbrado público' },
  { value: 'basura', label: 'Basura' },
]

const EMPTY_FORM = {
  nombre: '',
  equipo: '',
  tipo_incidencia: '',
  telefono: '',
  correo: '',
  horario: '',
  activo: true,
}

/**
 * Sección CRUD de contactos del equipo de atención.
 * Props: token, onError, onSuccess (callbacks para mostrar feedback global)
 */
export default function GestionContactos({ token }) {
  const [contactos, setContactos] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // UI state
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null) // null = crear, uuid = editar
  const [form, setForm] = useState(EMPTY_FORM)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  // Filters
  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  useEffect(() => {
    let isActive = true
    listContacts(token)
      .then((data) => {
        if (isActive) setContactos(data || [])
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
  }, [token])

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function openCreate() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setShowForm(true)
    setError('')
    setSuccess('')
  }

  function openEdit(contacto) {
    setForm({
      nombre: contacto.nombre,
      equipo: contacto.equipo,
      tipo_incidencia: contacto.tipoIncidencia || '',
      telefono: contacto.telefono,
      correo: contacto.correo || '',
      horario: contacto.horario || '',
      activo: contacto.activo,
    })
    setEditId(contacto.id)
    setShowForm(true)
    setError('')
    setSuccess('')
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setSuccess('')
    try {
      const contact = {
        ...form,
        tipo_incidencia: form.tipo_incidencia || null,
        correo: form.correo || null,
        horario: form.horario || null,
      }

      if (editId) {
        const updated = await saveContact(contact, token, editId)
        setContactos((prev) => prev.map((c) => (c.id === editId ? updated : c)))
        setSuccess('Contacto actualizado correctamente.')
      } else {
        const created = await saveContact(contact, token)
        setContactos((prev) => [created, ...prev])
        setSuccess('Contacto creado correctamente.')
      }
      cancelForm()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(id) {
    setError('')
    setSuccess('')
    try {
      await deleteContact(id, token)
      setContactos((prev) => prev.filter((c) => c.id !== id))
      setSuccess('Contacto eliminado.')
      setConfirmDeleteId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  // Filtered list
  const filtrados = contactos.filter((c) => {
    const texto = filtroTexto.toLowerCase()
    const matchTexto =
      !texto ||
      c.nombre.toLowerCase().includes(texto) ||
      c.equipo.toLowerCase().includes(texto) ||
      (c.telefono && c.telefono.includes(texto))
    const matchTipo = !filtroTipo || c.tipoIncidencia === filtroTipo
    return matchTexto && matchTipo
  })

  return (
    <section className="panel" aria-labelledby="contactos-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ATENCIÓN DE INCIDENCIAS</p>
          <h2 id="contactos-title">Equipos y contactos</h2>
        </div>
        <button
          className="button button-primary"
          onClick={openCreate}
          type="button"
        >
          + Agregar contacto
        </button>
      </div>

      {error && <p className="feedback feedback-error" role="alert">{error}</p>}
      {success && <p className="feedback feedback-success" role="status">{success}</p>}

      {/* Formulario de creación / edición */}
      {showForm && (
        <form
          className="contacto-form"
          onSubmit={handleSubmit}
          aria-label={editId ? 'Editar contacto' : 'Nuevo contacto'}
        >
          <p className="eyebrow" style={{ gridColumn: '1 / -1', marginBottom: 4 }}>
            {editId ? '✏️ Editando contacto' : '✨ Nuevo contacto'}
          </p>

          <label htmlFor="cf-nombre">
            Nombre de la persona *
            <input
              id="cf-nombre"
              maxLength={120}
              onChange={(e) => updateField('nombre', e.target.value)}
              required
              value={form.nombre}
              placeholder="Ej. Juan García"
            />
          </label>

          <label htmlFor="cf-equipo">
            Equipo / Cuadrilla *
            <input
              id="cf-equipo"
              maxLength={120}
              onChange={(e) => updateField('equipo', e.target.value)}
              required
              value={form.equipo}
              placeholder="Ej. Cuadrilla de bacheo norte"
            />
          </label>

          <label htmlFor="cf-tipo">
            Tipo de incidencia que atiende
            <select
              id="cf-tipo"
              onChange={(e) => updateField('tipo_incidencia', e.target.value)}
              value={form.tipo_incidencia}
            >
              <option value="">Sin especificar</option>
              {TIPOS.slice(1).map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>

          <label htmlFor="cf-telefono">
            Teléfono * (7–15 dígitos, puede iniciar con +)
            <input
              id="cf-telefono"
              type="tel"
              pattern="^\+?[0-9]{7,15}$"
              onChange={(e) => updateField('telefono', e.target.value)}
              required
              value={form.telefono}
              placeholder="Ej. +526641234567"
            />
          </label>

          <label htmlFor="cf-correo">
            Correo electrónico (opcional)
            <input
              id="cf-correo"
              type="email"
              onChange={(e) => updateField('correo', e.target.value)}
              value={form.correo}
              placeholder="Ej. juan@municipio.gob.mx"
            />
          </label>

          <label htmlFor="cf-horario">
            Horario de atención (opcional)
            <input
              id="cf-horario"
              maxLength={120}
              onChange={(e) => updateField('horario', e.target.value)}
              value={form.horario}
              placeholder="Ej. Lun–Vie 08:00–17:00"
            />
          </label>

          <label className="contacto-form-activo" htmlFor="cf-activo">
            <input
              id="cf-activo"
              type="checkbox"
              checked={form.activo}
              onChange={(e) => updateField('activo', e.target.checked)}
            />
            Contacto activo
          </label>

          <div className="contacto-form-footer">
            <button
              className="button button-secondary"
              onClick={cancelForm}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="button button-primary"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear contacto'}
            </button>
          </div>
        </form>
      )}

      {/* Filtros */}
      <div className="contacto-filtros">
        <input
          className="contacto-filtro-input"
          type="search"
          placeholder="Buscar por nombre, equipo o teléfono…"
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          aria-label="Buscar contacto"
        />
        <select
          className="contacto-filtro-select"
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          aria-label="Filtrar por tipo de incidencia"
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Lista de contactos */}
      {isLoading ? (
        <p className="empty-state">Cargando contactos…</p>
      ) : filtrados.length === 0 ? (
        <p className="empty-state">
          {contactos.length === 0
            ? 'Aún no hay contactos. Usa el botón "+ Agregar contacto" para comenzar.'
            : 'Ningún contacto coincide con la búsqueda.'}
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Equipo / Cuadrilla</th>
                <th scope="col">Tipo incidencia</th>
                <th scope="col">Teléfono</th>
                <th scope="col">Correo</th>
                <th scope="col">Horario</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((contacto) => (
                <tr key={contacto.id} className={!contacto.activo ? 'contacto-inactivo' : ''}>
                  <td className="incident-title-cell">{contacto.nombre}</td>
                  <td>{contacto.equipo}</td>
                  <td>{contacto.tipoIncidenciaNombre || <span className="field-hint">Sin especificar</span>}</td>
                  <td>
                    <a href={`tel:${contacto.telefono}`} className="contacto-tel-link">
                      {contacto.telefono}
                    </a>
                  </td>
                  <td>
                    {contacto.correo
                      ? <a href={`mailto:${contacto.correo}`} className="contacto-tel-link">{contacto.correo}</a>
                      : <span className="field-hint">—</span>}
                  </td>
                  <td className="date-cell">{contacto.horario || <span className="field-hint">—</span>}</td>
                  <td>
                    <span className={`status-badge ${contacto.activo ? 'contacto-badge-activo' : 'contacto-badge-inactivo'}`}>
                      {contacto.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    {confirmDeleteId === contacto.id ? (
                      <div className="row-actions">
                        <span className="field-hint">¿Eliminar?</span>
                        <button
                          className="button button-danger button-small"
                          onClick={() => handleDelete(contacto.id)}
                          type="button"
                        >
                          Sí, eliminar
                        </button>
                        <button
                          className="button button-secondary button-small"
                          onClick={() => setConfirmDeleteId(null)}
                          type="button"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="row-actions">
                        <button
                          className="button button-secondary button-small"
                          onClick={() => openEdit(contacto)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className="button button-danger button-small"
                          onClick={() => setConfirmDeleteId(contacto.id)}
                          type="button"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
