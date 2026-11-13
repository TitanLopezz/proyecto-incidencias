import { useEffect, useId, useRef, useState } from 'react'
import { MAX_PHOTO_BYTES, uploadPhoto, loadPhoto, listPhotos, deletePhoto } from '../api/photos'
import './IncidentPhotos.css'

function PhotoEditor({ file, onSave, onCancel }) {
  const canvas = useRef(null)
  const [image, setImage] = useState(null)
  const [crop, setCrop] = useState({ left: 0, top: 0, width: 100, height: 100 })
  const [rotation, setRotation] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    let active = true
    img.onload = () => {
      if (!active) return
      if (img.naturalWidth * img.naturalHeight > 25000000) setError('La foto debe tener como máximo 25 megapíxeles.')
      else setImage(img)
    }
    img.onerror = () => { if (active) setError('La imagen no es válida.') }
    img.src = url
    return () => { active = false; URL.revokeObjectURL(url) }
  }, [file])

  useEffect(() => {
    if (!image || !canvas.current) return
    const sx = image.naturalWidth * crop.left / 100
    const sy = image.naturalHeight * crop.top / 100
    const sw = image.naturalWidth * Math.min(crop.width, 100 - crop.left) / 100
    const sh = image.naturalHeight * Math.min(crop.height, 100 - crop.top) / 100
    const scale = Math.min(1, 1600 / Math.max(sw, sh))
    const w = Math.max(1, Math.round(sw * scale))
    const h = Math.max(1, Math.round(sh * scale))
    const rotated = rotation % 180 !== 0
    const target = canvas.current
    target.width = rotated ? h : w
    target.height = rotated ? w : h
    const context = target.getContext('2d')
    context.translate(target.width / 2, target.height / 2)
    context.rotate(rotation * Math.PI / 180)
    context.drawImage(image, sx, sy, sw, sh, -w / 2, -h / 2, w, h)
  }, [image, crop, rotation])

  async function save() {
    setBusy(true)
    setError('')
    try {
      const blob = await new Promise(resolve => canvas.current.toBlob(resolve, 'image/webp', 0.85))
      if (!blob || blob.size > MAX_PHOTO_BYTES) throw new Error('La foto editada supera 2 MB. Recórtala un poco más.')
      await onSave(new File([blob], 'foto.webp', { type: 'image/webp' }))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return <section className="photo-editor" aria-label="Editar foto">
    <h4>Recortar y girar foto</h4>
    <canvas ref={canvas} aria-label="Vista previa del recorte" />
    <p>Ajusta el inicio y el tamaño del recorte. La vista previa muestra el resultado.</p>
    <div className="photo-crop-controls">
      {[
        ['left', 'Inicio horizontal', 0, 95], ['top', 'Inicio vertical', 0, 95],
        ['width', 'Ancho', 5, 100 - crop.left], ['height', 'Alto', 5, 100 - crop.top],
      ].map(([key, label, min, max]) => <label key={key}>{label}: {crop[key]}%
        <input type="range" min={min} max={max} value={crop[key]} disabled={busy} onChange={event => {
          const value = Number(event.target.value)
          setCrop(current => {
            const next = { ...current, [key]: value }
            next.width = Math.min(next.width, 100 - next.left)
            next.height = Math.min(next.height, 100 - next.top)
            return next
          })
        }} />
      </label>)}
    </div>
    {error && <p role="alert" className="feedback feedback-error">{error}</p>}
    <div className="photo-actions">
      <button type="button" disabled={busy} onClick={() => setRotation(value => (value + 90) % 360)}>Girar 90°</button>
      <button type="button" disabled={busy} onClick={() => { setCrop({ left: 0, top: 0, width: 100, height: 100 }); setRotation(0) }}>Restablecer</button>
      <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
      <button type="button" disabled={!image || busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar foto'}</button>
    </div>
  </section>
}

function LocalPreview({ file }) {
  const preview = useRef(null)
  useEffect(() => {
    const next = URL.createObjectURL(file)
    if (preview.current) preview.current.src = next
    return () => URL.revokeObjectURL(next)
  }, [file])
  return <img ref={preview} alt="Foto adjunta al reporte" />
}

export function PhotoPicker({ files, onChange, disabled = false }) {
  const id = useId()
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  return <fieldset className="incident-photos" disabled={disabled}>
    <legend>Fotos opcionales</legend>
    <p>JPG, PNG o WebP. Máximo 2 MB por foto y 10 fotos por incidencia.</p>
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => {
      const incoming = Array.from(event.target.files || [])
      event.target.value = ''
      if (incoming.some(file => file.size > MAX_PHOTO_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
        setError('Selecciona fotos JPG, PNG o WebP de máximo 2 MB cada una.'); return
      }
      if (files.length + incoming.length > 10) { setError('Puedes adjuntar hasta 10 fotos.'); return }
      setError(''); onChange([...files, ...incoming])
    }} />
    <div className="photo-grid">{files.map((file, index) => <div className="photo-item" key={index}>
      <LocalPreview file={file} />
      <div className="photo-actions">
        <button type="button" onClick={() => setEditing({ file, index })}>Editar / recortar</button>
        <label className="photo-replace">Reemplazar<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const replacement = event.target.files?.[0]; event.target.value = ''
          if (!replacement) return
          if (replacement.size > MAX_PHOTO_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(replacement.type)) { setError('La foto debe ser JPG, PNG o WebP de máximo 2 MB.'); return }
          setError(''); onChange(files.map((item, i) => i === index ? replacement : item))
        }} /></label>
        <button type="button" onClick={() => onChange(files.filter((_, i) => i !== index))}>Quitar</button>
      </div>
    </div>)}</div>
    {error && <p role="alert">{error}</p>}
    {editing && <PhotoEditor file={editing.file} onCancel={() => setEditing(null)} onSave={file => {
      onChange(files.map((item, i) => i === editing.index ? file : item)); setEditing(null)
    }} />}
  </fieldset>
}

function SavedPhoto({ incidentId, photo, token, onEdit, onDelete, busy, readOnly }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl
    loadPhoto(incidentId, photo.id, token, true, controller.signal).then(blob => {
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl)
    }).catch(err => { if (err.name !== 'AbortError') setError(err.message) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [incidentId, photo, token])
  return <div className="photo-item">
    {url && <img src={url} alt="Evidencia de la incidencia" loading="lazy" />}
    {error && <p role="alert">{error}</p>}
    <div className="photo-actions">
      <button type="button" disabled={busy} onClick={() => onEdit(photo.id, false)}>Ver completa</button>
      {!readOnly && <>
      <button type="button" disabled={busy} onClick={() => onEdit(photo.id, true)}>Editar / recortar</button>
      <label className="photo-replace">Reemplazar<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''
        if (file) onEdit(photo.id, true, file)
      }} /></label>
      <button type="button" disabled={busy} onClick={() => onDelete(photo.id)}>Eliminar foto</button>
      </>}
    </div>
  </div>
}

export default function IncidentPhotos({ incidentId, token, readOnly = false }) {
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  async function refresh() { setPhotos(await listPhotos(incidentId, token)) }
  async function action(callback) {
    setError(''); setBusy(true)
    try { await callback() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  useEffect(() => () => { if (viewing) URL.revokeObjectURL(viewing) }, [viewing])
  async function edit(photoId, shouldEdit, replacement) {
    await action(async () => {
      if (replacement && (replacement.size > MAX_PHOTO_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(replacement.type))) throw new Error('La foto debe ser JPG, PNG o WebP de máximo 2 MB.')
      const file = replacement || await loadPhoto(incidentId, photoId, token)
      if (shouldEdit) setEditing({ photoId, file })
      else setViewing(URL.createObjectURL(file))
    })
  }
  return <section className="incident-photos" aria-label="Fotos de la incidencia">
    <button type="button" disabled={busy} onClick={() => {
      if (open) { setOpen(false); setEditing(null); setViewing(null) }
      else action(async () => { await refresh(); setOpen(true) })
    }}>{busy ? 'Cargando…' : open ? 'Ocultar fotos' : readOnly ? 'Ver fotos' : 'Ver / administrar fotos'}</button>
    {error && <p className="feedback feedback-error" role="alert">{error}</p>}
    {open && <>
      {!readOnly && <p>Máximo 2 MB por foto · {photos.length}/10 fotos · Guardado local</p>}
      {!readOnly && <label className="photo-replace">Agregar otra foto<input type="file" disabled={busy || photos.length >= 10} accept="image/jpeg,image/png,image/webp" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''
        if (!file) return
        if (file.size > MAX_PHOTO_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('La foto debe ser JPG, PNG o WebP de máximo 2 MB.'); return }
        setError(''); setEditing({ file })
      }} /></label>}
      {!photos.length && <p>Este reporte todavía no tiene fotos.</p>}
      <div className="photo-grid">{photos.map(photo => <SavedPhoto key={photo.id} incidentId={incidentId} photo={photo} token={token} busy={busy} readOnly={readOnly} onEdit={edit} onDelete={photoId => action(async () => {
        await deletePhoto(incidentId, photoId, token); await refresh()
      })} />)}</div>
      {viewing && <div className="photo-full"><button type="button" onClick={() => setViewing(null)}>Cerrar foto</button><img src={viewing} alt="Foto completa de la incidencia" /></div>}
      {!readOnly && editing && <PhotoEditor key={editing.photoId || 'new'} file={editing.file} onCancel={() => setEditing(null)} onSave={async file => {
        setBusy(true)
        try {
          await uploadPhoto(incidentId, file, token, editing.photoId)
          setEditing(null)
          try { await refresh() } catch (err) { setError(`La foto se guardó, pero no se pudo actualizar la lista: ${err.message}`) }
        } finally { setBusy(false) }
      }} />}
    </>}
  </section>
}
