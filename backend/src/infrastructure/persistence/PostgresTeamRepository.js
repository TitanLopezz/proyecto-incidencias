class PostgresTeamRepository {
  constructor(pool) {
    this.pool = pool
  }

  // ─── Contactos ───────────────────────────────────────────────────────────

  async listContactos({ soloActivos = false } = {}) {
    const result = await this.pool.query(
      `SELECT
         c.id, c.nombre, c.equipo, c.tipo_incidencia,
         cat.name AS tipo_incidencia_nombre,
         c.telefono, c.correo, c.horario, c.activo,
         c.created_at, c.updated_at
       FROM contactos_equipo c
       LEFT JOIN categories cat ON cat.code = c.tipo_incidencia
       ${soloActivos ? 'WHERE c.activo = TRUE' : ''}
       ORDER BY c.activo DESC, c.equipo, c.nombre`,
    )
    return result.rows.map(this._contactoToDomain)
  }

  async findContactoById(id) {
    const result = await this.pool.query(
      `SELECT
         c.id, c.nombre, c.equipo, c.tipo_incidencia,
         cat.name AS tipo_incidencia_nombre,
         c.telefono, c.correo, c.horario, c.activo,
         c.created_at, c.updated_at
       FROM contactos_equipo c
       LEFT JOIN categories cat ON cat.code = c.tipo_incidencia
       WHERE c.id = $1`,
      [id],
    )
    return result.rows[0] ? this._contactoToDomain(result.rows[0]) : null
  }

  async findIncidentById(id) {
    const result = await this.pool.query(
      'SELECT id FROM incidents WHERE id = $1',
      [id],
    )
    return result.rows[0] || null
  }

  async createContacto({ nombre, equipo, tipo_incidencia, telefono, correo, horario, activo }) {
    const result = await this.pool.query(
      `WITH created AS (
         INSERT INTO contactos_equipo (nombre, equipo, tipo_incidencia, telefono, correo, horario, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *
       )
       SELECT c.id, c.nombre, c.equipo, c.tipo_incidencia,
              cat.name AS tipo_incidencia_nombre,
              c.telefono, c.correo, c.horario, c.activo, c.created_at, c.updated_at
       FROM created c
       LEFT JOIN categories cat ON cat.code = c.tipo_incidencia`,
      [
        nombre.trim(),
        equipo.trim(),
        tipo_incidencia || null,
        telefono.trim(),
        correo ? correo.trim() : null,
        horario ? horario.trim() : null,
        activo !== false,
      ],
    )
    return this._contactoToDomain(result.rows[0])
  }

  async updateContacto(id, { nombre, equipo, tipo_incidencia, telefono, correo, horario, activo }) {
    const result = await this.pool.query(
      `WITH updated AS (
         UPDATE contactos_equipo
         SET nombre = $2, equipo = $3, tipo_incidencia = $4, telefono = $5,
             correo = $6, horario = $7, activo = $8, updated_at = NOW()
         WHERE id = $1
         RETURNING *
       )
       SELECT c.id, c.nombre, c.equipo, c.tipo_incidencia,
              cat.name AS tipo_incidencia_nombre,
              c.telefono, c.correo, c.horario, c.activo, c.created_at, c.updated_at
       FROM updated c
       LEFT JOIN categories cat ON cat.code = c.tipo_incidencia`,
      [
        id,
        nombre.trim(),
        equipo.trim(),
        tipo_incidencia || null,
        telefono.trim(),
        correo ? correo.trim() : null,
        horario ? horario.trim() : null,
        activo !== false,
      ],
    )
    return result.rows[0] ? this._contactoToDomain(result.rows[0]) : null
  }

  async deleteContacto(id) {
    const result = await this.pool.query(
      'DELETE FROM contactos_equipo WHERE id = $1 RETURNING id',
      [id],
    )
    return result.rowCount > 0
  }

  // ─── Llamadas ─────────────────────────────────────────────────────────────

  async listLlamadas({ incident_id, llamada_id } = {}) {
    const conditions = []
    const params = []

    if (incident_id) {
      params.push(incident_id)
      conditions.push(`l.incident_id = $${params.length}`)
    }
    if (llamada_id) {
      params.push(llamada_id)
      conditions.push(`l.id = $${params.length}`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await this.pool.query(
      `SELECT
         l.id, l.incident_id, l.canal, l.notas, l.created_at,
         l.contacto_id,
         l.contacto_nombre, l.contacto_equipo, l.contacto_telefono,
         u.id AS admin_id, u.name AS admin_nombre,
         i.title AS incidencia_titulo, i.status AS incidencia_estado,
         i.category_code AS incidencia_categoria,
         cat.name AS incidencia_categoria_nombre
       FROM llamadas_equipo l
       LEFT JOIN users u ON u.id = l.admin_id
       LEFT JOIN incidents i ON i.id = l.incident_id
       LEFT JOIN categories cat ON cat.code = i.category_code
       ${where}
       ORDER BY l.created_at DESC`,
      params,
    )
    return result.rows.map(this._llamadaToDomain)
  }

  async createLlamada({ incident_id, contacto_id, admin_id, canal, notas }) {
    const result = await this.pool.query(
      `INSERT INTO llamadas_equipo (
         incident_id, contacto_id, contacto_nombre, contacto_equipo, contacto_telefono,
         admin_id, canal, notas
       )
       SELECT $1, c.id, c.nombre, c.equipo, c.telefono, $3, $4, $5
       FROM contactos_equipo c
       WHERE c.id = $2
       RETURNING id`,
       [incident_id || null, contacto_id, admin_id || null, canal, notas || null],
    )
    const row = result.rows[0]
    if (!row) return null
    const [llamada] = await this.listLlamadas({ llamada_id: row.id })
    return llamada || null
  }

  // ─── Mappers ──────────────────────────────────────────────────────────────

  _contactoToDomain(row) {
    return {
      id: row.id,
      nombre: row.nombre,
      equipo: row.equipo,
      tipoIncidencia: row.tipo_incidencia,
      tipoIncidenciaNombre: row.tipo_incidencia_nombre || null,
      telefono: row.telefono,
      correo: row.correo || null,
      horario: row.horario || null,
      activo: row.activo,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  _llamadaToDomain(row) {
    return {
      id: row.id,
      canal: row.canal,
      notas: row.notas || null,
      createdAt: row.created_at,
      contacto: {
        id: row.contacto_id,
        nombre: row.contacto_nombre,
        equipo: row.contacto_equipo,
        telefono: row.contacto_telefono,
      },
      admin: row.admin_id ? { id: row.admin_id, nombre: row.admin_nombre } : null,
      incidencia: row.incident_id
        ? {
            id: row.incident_id,
            titulo: row.incidencia_titulo,
            estado: row.incidencia_estado,
            categoria: row.incidencia_categoria,
            categoriaNombre: row.incidencia_categoria_nombre,
          }
        : null,
    }
  }
}

module.exports = PostgresTeamRepository
