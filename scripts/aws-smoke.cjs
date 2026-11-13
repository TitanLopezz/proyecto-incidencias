// Disposable Compose environment only. Never point this test at a production DB.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { randomUUID } = require('node:crypto')
const { Pool } = require('pg')
const sharp = require('sharp')
const base = 'http://frontend:8080'
const statePath = '/app/test-state/state.json'
const password = 'Disposable-Test-Password-2026'

async function request(route, { token, method = 'GET', body, binary, expected = 200, headers = {} } = {}) {
  const response = await fetch(`${base}/api${route}`, {
    method,
    headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...(binary ? { 'content-type': 'application/octet-stream' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), ...(binary ? { body: binary } : {}),
  })
  assert.equal(response.status, expected, `${method} ${route}: ${response.status}`)
  if (expected === 204) return
  if (response.headers.get('content-type')?.startsWith('image/')) return response
  const payload = await response.json()
  return payload.data
}

async function main() {
  assert.equal(process.env.PGHOST, 'db', 'This smoke test only runs in the disposable Compose network')
  const ready = await fetch(`${base}/ready`)
  assert.equal(ready.status, 200)
  const page = await fetch(`${base}/staff/dashboard`)
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff')
  const pool = new Pool()
  try {
    if (process.argv[2] === 'persistence') {
      const state = JSON.parse(await fs.readFile(statePath, 'utf8'))
      const session = await request('/auth/login', { method: 'POST', body: { email: state.email, password } })
      const response = await request(`/incidents/${state.incidentId}/photos/${state.photoId}`, { token: session.token })
      assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format, 'webp')
      assert.equal((await request(`/incidents/${state.incidentId}/photos`, { token: session.token })).length, 1)
      console.log('OK: report and local photo survived container recreation.')
      return
    }
    const suffix = randomUUID().slice(0, 8)
    const email = `verify-${suffix}@example.test`
    const register = async (name, accountEmail) => request('/auth/register', { method: 'POST', expected: 201, body: { name, email: accountEmail, password } })
    const session = await register('Verificación de fotos', email)
    const other = await register('Otro ciudadano', `other-${suffix}@example.test`)
    const staff = await register('Personal de prueba', `staff-${suffix}@example.test`)
    await pool.query("UPDATE users SET role = 'superadmin' WHERE id = $1", [staff.user.id])
    await request('/auth/login', { method: 'POST', body: { email: `staff-${suffix}@example.test`, password }, expected: 401 })
    await request('/staff/auth/login', { method: 'POST', body: { email: `staff-${suffix}@example.test`, password } })
    await request('/admins', { token: staff.token, method: 'POST', expected: 201, body: { name: 'Administrador de prueba', email: `admin-${suffix}@example.test`, password } })
    const incident = await request('/incidents', { token: session.token, method: 'POST', expected: 201, body: {
      title: 'Prueba de fotos y persistencia', description: 'Reporte de verificación en entorno aislado', category: 'bache', latitude: 16.7528, longitude: -93.1152,
    } })
    await request('/incidents', { expected: 401 })
    await request(`/incidents/${incident.id}/photos`, { token: other.token, expected: 403 })
    await request(`/incidents/${incident.id}/photos`, { token: session.token, method: 'POST', binary: Buffer.alloc(2 * 1024 * 1024 + 1), expected: 413 })
    await request(`/incidents/${incident.id}/photos`, { token: session.token, method: 'POST', binary: Buffer.from('invalid-image'), expected: 400 })
    const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#2877c8' } }).png().toBuffer()
    await fs.writeFile('/app/test-state/foto-prueba.png', photo)
    await fs.writeFile('/app/test-state/foto-grande.png', Buffer.concat([photo, Buffer.alloc(2 * 1024 * 1024 + 1)]))
    const path = `/incidents/${incident.id}/photos`
    const first = await request(path, { token: session.token, method: 'POST', binary: photo, expected: 201 })
    const second = await request(path, { token: session.token, method: 'POST', binary: photo, expected: 201 })
    assert.equal((await request(path, { token: session.token })).length, 2)
    const cropped = await sharp(photo).extract({ left: 100, top: 100, width: 300, height: 200 }).rotate(90).webp().toBuffer()
    await request(`${path}/${first.id}`, { token: session.token, method: 'PUT', binary: cropped })
    const served = await request(`${path}/${first.id}`, { token: staff.token })
    const meta = await sharp(Buffer.from(await served.arrayBuffer())).metadata()
    assert.equal(meta.width, 200); assert.equal(meta.height, 300)
    assert.equal(served.headers.get('cache-control'), 'private, no-store')
    await request(`${path}/${first.id}`, { token: other.token, method: 'PUT', binary: photo, expected: 403 })
    await request(`${path}/${first.id}`, { token: other.token, method: 'DELETE', expected: 403 })
    await request(`${path}/${second.id}`, { token: session.token, method: 'DELETE', expected: 204 })
    await request(`${path}/${second.id}`, { token: session.token, expected: 404 })

    const link = await request('/telegram/link', { token: session.token, method: 'POST', expected: 201 })
    const chatId = String(100000000000 + parseInt(suffix, 16))
    await request('/integrations/telegram', {
      method: 'POST', body: { action: 'link', chatId, code: link.code },
      headers: { 'x-telegram-integration-key': 'disposable-telegram-key-for-verification-only' },
    })
    const preference = await request('/telegram/notifications', { token: session.token })
    assert.deepEqual(preference, { linked: true, enabled: false, available: false })

    const socket = new WebSocket('ws://frontend:8080/socket.io/?EIO=4&transport=websocket')
    let notificationResolve
    const connected = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 10000)
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Socket connection failed')) })
      socket.addEventListener('message', event => {
        const text = String(event.data)
        if (text.startsWith('0')) socket.send(`40${JSON.stringify({ token: session.token })}`)
        else if (text === '2') socket.send('3')
        else if (text.startsWith('40')) { clearTimeout(timer); resolve() }
        else if (text.startsWith('42')) {
          const [name, data] = JSON.parse(text.slice(2))
          if (name === 'new_notification') notificationResolve?.(data)
        }
      })
    })
    try {
      await connected
      const notification = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Socket notification timed out')), 10000)
        notificationResolve = value => { clearTimeout(timer); resolve(value) }
      })
      await request(`/incidents/${incident.id}/status`, { token: staff.token, method: 'PATCH', body: { status: 'en_proceso' } })
      assert.ok((await notification).id)
    } finally { socket.close() }
    const notifications = await request('/notifications', { token: session.token })
    assert.ok(notifications.length)
    await request(`/notifications/${notifications[0].id}/read`, { token: session.token, method: 'PATCH' })

    // Run the real outbox against PostgreSQL with a simulated Telegram provider.
    const PostgresTelegramLinks = require('./src/infrastructure/persistence/PostgresTelegramLinks')
    const PostgresOutbox = require('./src/infrastructure/persistence/PostgresTelegramNotificationOutbox')
    const Deliver = require('./src/application/use-cases/DeliverTelegramNotification')
    const links = new PostgresTelegramLinks(pool)
    const outbox = new PostgresOutbox(pool)
    const getQueue = async id => (await pool.query(
      'SELECT transition_id, delivery_state, attempts FROM telegram_notification_outbox WHERE incident_id = $1 ORDER BY transition_id',
      [id],
    )).rows
    assert.deepEqual(await getQueue(incident.id), [])
    await links.setPreference(session.user.id, true)
    const edit = { title: 'Prueba de notificación', description: 'Edición con transición', status: 'resuelta' }
    const editRequest = () => request(`/incidents/${incident.id}`, { token: staff.token, method: 'PUT', body: edit })
    await Promise.all([editRequest(), editRequest()])
    await request(`/incidents/${incident.id}`, { token: staff.token, method: 'PUT', body: { ...edit, title: 'Solo cambia el título' } })
    const offline = (await request('/notifications', { token: session.token })).filter(item => item.incidentId === incident.id)
    assert.equal(offline.length, 2)
    assert.equal(offline.filter(item => item.message.includes('«Resuelta»')).length, 1)
    assert.equal((await getQueue(incident.id)).length, 1)

    const sent = []
    const delivery = new Deliver({ outbox, sender: {
      async send(recipient, text) {
        sent.push({ recipient, text })
        return sent.length === 1 ? { type: 'retry', result: 'rate_limited', retryAfter: 30 } : { type: 'sent', result: 'accepted' }
      },
    } })
    await Promise.all([delivery.execute(), delivery.execute()])
    assert.equal(sent.length, 1)
    const [queued] = await getQueue(incident.id)
    assert.equal(queued.delivery_state, 'pending')
    assert.equal(queued.attempts, 1)
    assert.equal((await request('/incidents', { token: session.token })).find(item => item.id === incident.id).status, 'resuelta')
    await pool.query('UPDATE telegram_notification_outbox SET next_attempt_at = NOW() WHERE transition_id = $1', [queued.transition_id])
    await Promise.all([delivery.execute(), delivery.execute()])
    assert.deepEqual(sent[1], { recipient: chatId, text: `Folio: ${incident.id}\nEstado: Resuelta` })
    assert.equal(sent.length, 2)
    assert.equal((await getQueue(incident.id))[0].delivery_state, 'sent')
    assert.equal((await request('/notifications', { token: session.token })).filter(item => item.incidentId === incident.id).length, 2)

    await request(`/incidents/${incident.id}/status`, { token: staff.token, method: 'PATCH', body: { status: 'cerrada' } })
    const disabled = await request('/telegram/notifications', { token: session.token, method: 'PUT', body: { enabled: false } })
    assert.equal(disabled.enabled, false)
    assert.equal((await getQueue(incident.id)).at(-1).delivery_state, 'cancelled')
    await links.setPreference(session.user.id, true)
    const revocable = await request('/incidents', { token: session.token, method: 'POST', expected: 201, body: {
      title: 'Revocación de aviso', description: 'Prueba de desvinculación', category: 'bache', latitude: 16.75, longitude: -93.11,
    } })
    await request(`/incidents/${revocable.id}/status`, { token: staff.token, method: 'PATCH', body: { status: 'en_proceso' } })
    const claimed = await outbox.claim()
    assert.equal(claimed.incidentId, revocable.id)
    await request('/telegram/link', { token: session.token, method: 'DELETE', expected: 204 })
    assert.equal(await outbox.findRecipient(claimed), undefined)
    await outbox.finish(claimed, { state: 'cancelled', result: 'no_consent' })
    assert.equal((await getQueue(revocable.id))[0].delivery_state, 'cancelled')
    await request('/analytics/heatmap', { token: staff.token })
    await request('/analytics/clusters?epsMeters=200&minPoints=2', { token: staff.token })
    const contact = await request('/contactos', { token: staff.token, method: 'POST', expected: 201, body: {
      nombre: 'Equipo de prueba', equipo: 'Obras', telefono: '9611234567', tipo_incidencia: 'bache',
    } })
    await request('/llamadas', { token: staff.token, method: 'POST', expected: 201, body: { incident_id: incident.id, contacto_id: contact.id, canal: 'telefono', notas: 'Verificación' } })
    const disposable = await request('/incidents', { token: session.token, method: 'POST', expected: 201, body: {
      title: 'Reporte de archivo', description: 'Comprueba la conservación de fotos e historial', category: 'bache', latitude: 16.7528, longitude: -93.1152,
    } })
    const assignmentPath = `/incidents/${disposable.id}/assignment`
    const historyPath = `/incidents/${disposable.id}/assignment-history`
    await pool.query("UPDATE incidents SET created_at = NOW() - INTERVAL '4 days' WHERE id = $1", [disposable.id])
    const board = async () => (await request('/incidents/assignments', { token: staff.token })).find(item => item.id === disposable.id)
    const pending = await board()
    assert.equal(pending.needsAssignment, true)
    assert.equal(pending.overdue, true)
    assert.equal(pending.escalated, true)
    await request('/incidents/assignments', { token: session.token, expected: 403 })
    await request(historyPath, { token: session.token, expected: 403 })
    await request(assignmentPath, { token: session.token, method: 'PUT', body: { contactId: contact.id }, expected: 403 })
    await request(assignmentPath, { token: staff.token, method: 'PUT', body: { contactId: contact.id }, expected: 204 })
    const firstAssignment = await board()
    assert.equal(firstAssignment.contactId, contact.id)
    assert.equal(firstAssignment.needsAssignment, false)
    assert.ok(new Date(firstAssignment.assignedAt) > new Date(firstAssignment.receivedAt))
    await request(assignmentPath, { token: staff.token, method: 'PUT', body: { contactId: contact.id }, expected: 204 })
    const secondContact = await request('/contactos', { token: staff.token, method: 'POST', expected: 201, body: {
      nombre: 'Contacto de reemplazo', equipo: 'Mantenimiento', telefono: '9611234568',
    } })
    await request(assignmentPath, { token: staff.token, method: 'PUT', body: { contactId: secondContact.id }, expected: 204 })
    const reassigned = await board()
    assert.equal(reassigned.contactId, secondContact.id)
    assert.equal(reassigned.dueAt, firstAssignment.dueAt)
    await request(`/contactos/${secondContact.id}`, { token: staff.token, method: 'DELETE' })
    assert.equal((await board()).needsAssignment, true)
    const assignments = await request(historyPath, { token: staff.token })
    assert.deepEqual(assignments.map(entry => entry.teamName), ['Mantenimiento', 'Obras'])
    assert.equal(assignments[0].assignedBy, staff.user.name)
    const disposablePhoto = await request(`/incidents/${disposable.id}/photos`, { token: session.token, method: 'POST', expected: 201, binary: photo })
    const { rows: keys } = await pool.query('SELECT photo_url FROM evidences WHERE id = $1', [disposablePhoto.id])
    const diskFile = `/app/uploads/photos/${keys[0].photo_url.slice(6)}`
    await fs.stat(diskFile)
    const archivePath = `/incidents/${disposable.id}/archive`
    await request(`/incidents/${disposable.id}`, { token: staff.token, method: 'DELETE', expected: 404 })
    await request(archivePath, { token: session.token, method: 'POST', body: { reason: 'Duplicado' }, expected: 403 })
    await request(archivePath, { token: staff.token, method: 'POST', body: { reason: '   ' }, expected: 400 })
    await request(archivePath, { token: staff.token, method: 'POST', body: { reason: 'Reporte duplicado' }, expected: 204 })
    await request(archivePath, { token: staff.token, method: 'POST', body: { reason: 'Segundo intento' }, expected: 204 })
    await fs.stat(diskFile)
    const archived = (await request('/incidents/archived', { token: staff.token })).find(item => item.id === disposable.id)
    assert.equal(archived.archiveReason, 'Reporte duplicado')
    assert.equal(archived.archivedBy, staff.user.id)
    assert.ok(archived.archivedAt)
    assert.ok(!(await request('/incidents', { token: staff.token })).some(item => item.id === disposable.id))
    assert.equal(await board(), undefined)
    assert.equal((await request(historyPath, { token: staff.token })).length, 2)
    await request('/incidents/archived', { token: session.token, expected: 403 })
    await request(`/incidents/${disposable.id}/photos/${disposablePhoto.id}`, { token: session.token, expected: 404 })
    const retained = await request(`/incidents/${disposable.id}/photos/${disposablePhoto.id}`, { token: staff.token })
    assert.equal((await sharp(Buffer.from(await retained.arrayBuffer())).metadata()).format, 'webp')
    await request(`/incidents/${disposable.id}/photos/${disposablePhoto.id}`, { token: staff.token, method: 'DELETE', expected: 403 })
    await request(`/incidents/${disposable.id}/status`, { token: staff.token, method: 'PATCH', body: { status: 'en_proceso' }, expected: 404 })
    const { rows: history } = await pool.query('SELECT new_status FROM incident_status_history WHERE incident_id = $1', [disposable.id])
    assert.deepEqual(history, [{ new_status: 'abierta' }])
    await fs.writeFile(statePath, JSON.stringify({ email, password, incidentId: incident.id, photoId: first.id }, null, 2))
    console.log('OK: PostGIS, permisos, asignaciones, archivo, fotos y avisos web y Telegram con proveedor simulado.')
  } finally { await pool.end() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
