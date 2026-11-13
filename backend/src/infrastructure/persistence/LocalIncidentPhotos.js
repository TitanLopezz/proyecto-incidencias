const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const sharp = require('sharp')
const Incident = require('../../domain/entities/Incident')
const ValidationError = require('../../domain/errors/ValidationError')
const NotFoundError = require('../../domain/errors/NotFoundError')
const ForbiddenError = require('../../domain/errors/ForbiddenError')

const MAX_BYTES = 2 * 1024 * 1024
const MAX_PHOTOS = 10

// Only opaque file keys are persisted in PostgreSQL. Files are never public.
class LocalIncidentPhotos {
  constructor(database, directory = process.env.PHOTO_STORAGE_DIR || path.resolve(__dirname, '../../../uploads/photos')) {
    this.database = database
    this.directory = path.resolve(directory)
  }

  async authorize(db, incidentId, auth, { write = false, lock = false } = {}) {
    if (!Incident.isValidId(incidentId)) throw new NotFoundError('Incidencia no encontrada.')
    const { rows } = await db.query(`SELECT created_by, archived_at FROM incidents WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [incidentId])
    if (!rows[0]) throw new NotFoundError('Incidencia no encontrada.')
    const staff = ['admin', 'superadmin'].includes(auth.role)
    if (rows[0].archived_at && !staff) throw new NotFoundError('Incidencia no encontrada.')
    if (rows[0].archived_at && write) throw new ForbiddenError('Las fotos archivadas son de solo lectura.')
    if (!staff && rows[0].created_by !== auth.userId) {
      throw new ForbiddenError('No tienes acceso a las fotos de esta incidencia.')
    }
  }

  async list(incidentId, auth) {
    await this.authorize(this.database, incidentId, auth)
    const { rows } = await this.database.query(
      "SELECT id, created_at FROM evidences WHERE incident_id = $1 AND photo_url LIKE 'local:%' ORDER BY created_at, id", [incidentId],
    )
    return rows.map(row => ({ id: row.id, createdAt: row.created_at }))
  }

  async normalize(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_BYTES) {
      throw new ValidationError('Cada foto debe pesar como máximo 2 MB.')
    }
    try {
      const image = sharp(buffer, { limitInputPixels: 25000000, animated: false, failOn: 'warning' })
      const metadata = await image.metadata()
      if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('format')
      const result = await image.rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 }).toBuffer()
      if (result.length > MAX_BYTES) throw new Error('size')
      return result
    } catch {
      throw new ValidationError('Selecciona una imagen JPG, PNG o WebP válida, sin animación y de hasta 25 megapíxeles.')
    }
  }

  filePath(key) {
    if (!/^local:[0-9a-f-]{36}\.webp$/.test(key)) throw new NotFoundError('Foto no encontrada.')
    return path.join(this.directory, key.slice(6))
  }

  async removeFile(key) {
    if (key?.startsWith('local:')) await fs.rm(this.filePath(key), { force: true })
  }

  async save(incidentId, auth, buffer, photoId) {
    // Check ownership before decoding potentially expensive input.
    await this.authorize(this.database, incidentId, auth, { write: true })
    if (photoId && !Incident.isValidId(photoId)) throw new NotFoundError('Foto no encontrada.')
    const image = await this.normalize(buffer)
    const key = `local:${randomUUID()}.webp`
    const client = await this.database.connect()
    let oldKey
    let saved = false
    try {
      await client.query('BEGIN')
      await this.authorize(client, incidentId, auth, { write: true, lock: true })
      if (photoId) {
        const { rows } = await client.query("SELECT photo_url FROM evidences WHERE id = $1 AND incident_id = $2 AND photo_url LIKE 'local:%'", [photoId, incidentId])
        if (!rows[0]) throw new NotFoundError('Foto no encontrada.')
        oldKey = rows[0].photo_url
      } else {
        const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM evidences WHERE incident_id = $1', [incidentId])
        if (rows[0].count >= MAX_PHOTOS) throw new ValidationError('Puedes guardar hasta 10 fotos por incidencia.')
      }
      await fs.mkdir(this.directory, { recursive: true })
      await fs.writeFile(this.filePath(key), image, { flag: 'wx' })
      const id = photoId || randomUUID()
      if (photoId) await client.query('UPDATE evidences SET photo_url = $1 WHERE id = $2', [key, id])
      else await client.query('INSERT INTO evidences (id, incident_id, photo_url) VALUES ($1, $2, $3)', [id, incidentId, key])
      await client.query('COMMIT')
      saved = true
      if (oldKey) await this.removeFile(oldKey).catch(error => console.error('No se pudo limpiar una foto reemplazada:', error.code))
      return { id }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      if (!saved) await this.removeFile(key).catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  async read(incidentId, photoId, auth, thumbnail = false) {
    await this.authorize(this.database, incidentId, auth)
    if (!Incident.isValidId(photoId)) throw new NotFoundError('Foto no encontrada.')
    const { rows } = await this.database.query('SELECT photo_url FROM evidences WHERE id = $1 AND incident_id = $2', [photoId, incidentId])
    if (!rows[0]) throw new NotFoundError('Foto no encontrada.')
    let image
    try { image = await fs.readFile(this.filePath(rows[0].photo_url)) } catch (error) {
      if (error.code === 'ENOENT') throw new NotFoundError('El archivo de la foto no está disponible.')
      throw error
    }
    return thumbnail ? sharp(image).resize({ width: 360, height: 240, fit: 'inside', withoutEnlargement: true }).webp({ quality: 65 }).toBuffer() : image
  }

  async delete(incidentId, photoId, auth) {
    if (!Incident.isValidId(photoId)) throw new NotFoundError('Foto no encontrada.')
    const client = await this.database.connect()
    let key
    try {
      await client.query('BEGIN')
      await this.authorize(client, incidentId, auth, { write: true, lock: true })
      const { rows } = await client.query("DELETE FROM evidences WHERE id = $1 AND incident_id = $2 AND photo_url LIKE 'local:%' RETURNING photo_url", [photoId, incidentId])
      if (!rows[0]) throw new NotFoundError('Foto no encontrada.')
      key = rows[0].photo_url
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally { client.release() }
    await this.removeFile(key).catch(error => console.error('No se pudo limpiar una foto eliminada:', error.code))
  }

}

module.exports = { LocalIncidentPhotos, MAX_BYTES }
