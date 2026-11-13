const IncidentRepository = require('../../domain/ports/IncidentRepository')
const Incident = require('../../domain/entities/Incident')
const IncidentStatusTransitions = require('../../domain/services/IncidentStatusTransitions')
const { createWebNotice } = require('../../domain/services/IncidentStatusNotice')

class PostgresIncidentRepository extends IncidentRepository {
  constructor(pool, notificationRepository) {
    super()
    this.pool = pool
    this.notificationRepository = notificationRepository
  }

  async getSpatialClusters({ epsMeters, minPoints }) {
    const result = await this.pool.query(`
      WITH clustered AS (
        SELECT id, title, category_code, priority, status,
               ST_Y(location) AS latitude, ST_X(location) AS longitude,
               ST_ClusterDBSCAN(ST_Transform(location, 32615), eps := $1, minpoints := $2)
                 OVER (ORDER BY id) AS cluster_id
        FROM incidents WHERE archived_at IS NULL AND location IS NOT NULL
      )
      SELECT *, (cluster_id IS NOT NULL) AS is_part_of_cluster
      FROM clustered ORDER BY cluster_id NULLS LAST, id
    `, [epsMeters, minPoints])
    return result.rows
  }

  async create(incident) {
    const result = await this.pool.query(
      `WITH created AS (
         INSERT INTO incidents (title, description, category_code, status, created_by, location)
         VALUES (
           $1, $2, $3, $4, $5,
           CASE
             WHEN $6::double precision IS NULL THEN NULL
             ELSE ST_SetSRID(ST_MakePoint($7::double precision, $6::double precision), 4326)
                  ::geometry(Point, 4326)
           END
         )
         RETURNING id, title, description, status, created_by, updated_by, updated_at,
                   category_code, created_at, ST_Y(location) AS latitude, ST_X(location) AS longitude
       )
       , history AS (
         INSERT INTO incident_status_history
           (incident_id, previous_status, new_status, changed_by)
         SELECT id, NULL, status, created_by FROM created
         RETURNING incident_id
       )
       SELECT created.*, categories.name AS category_name,
              reporter.name AS reporter_name, reporter.email AS reporter_email
       FROM created
       LEFT JOIN categories ON categories.code = created.category_code
       LEFT JOIN users AS reporter ON reporter.id = created.created_by`,
      [
        incident.title,
        incident.description,
        incident.category,
        incident.status,
        incident.createdBy,
        incident.latitude,
        incident.longitude,
      ],
    )

    return this.toDomain(result.rows[0])
  }

  async findAll({ userId, role = 'citizen', archived = false } = {}) {
    const result = await this.pool.query(
      `SELECT incidents.id, incidents.title, incidents.description, incidents.status,
             incidents.category_code, categories.name AS category_name,
             incidents.created_by, incidents.updated_by, incidents.updated_at, incidents.created_at,
             ST_Y(incidents.location) AS latitude, ST_X(incidents.location) AS longitude,
              reporter.name AS reporter_name, reporter.email AS reporter_email,
              incidents.archived_at, incidents.archived_by, incidents.archive_reason,
              archiver.name AS archiver_name
       FROM incidents
       LEFT JOIN categories ON categories.code = incidents.category_code
       LEFT JOIN users AS reporter ON reporter.id = incidents.created_by
       LEFT JOIN users AS archiver ON archiver.id = incidents.archived_by
        WHERE ($2::text IN ('admin', 'superadmin') OR incidents.created_by = $1)
          AND incidents.archived_at IS ${archived ? 'NOT ' : ''}NULL
       ORDER BY ${archived ? 'incidents.archived_at' : 'incidents.created_at'} DESC, incidents.id DESC`,
      [userId, role],
    )

    return result.rows.map((row) => {
      const incident = this.toDomain(row)
      return archived ? {
        ...incident,
        archivedAt: row.archived_at,
        archivedBy: row.archived_by,
        archivedByName: row.archiver_name,
        archiveReason: row.archive_reason,
      } : incident
    })
  }

  async getHeatmapData() {
    const result = await this.pool.query(
      `SELECT ST_Y(location) AS lat, ST_X(location) AS lng,
              CASE status
                WHEN 'abierta' THEN 1.0
                WHEN 'en_proceso' THEN 0.8
                WHEN 'resuelta' THEN 0.5
                WHEN 'cerrada' THEN 0.3
                ELSE 0.5
              END AS weight
       FROM incidents
       WHERE archived_at IS NULL AND location IS NOT NULL
       ORDER BY created_at DESC, id DESC`,
    )

    return result.rows.map((row) => ({
      lat: Number(row.lat),
      lng: Number(row.lng),
      weight: Number(row.weight),
    }))
  }

  update(id, incident, updatedBy) {
    return this.change(id, incident.status, updatedBy, incident)
  }

  updateStatus(id, status, updatedBy) {
    return this.change(id, status, updatedBy)
  }

  async change(id, status, updatedBy, details) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const previous = await client.query(
        'SELECT status FROM incidents WHERE id = $1 AND archived_at IS NULL FOR UPDATE', [id],
      )
      if (!previous.rows[0]) {
        await client.query('ROLLBACK')
        return null
      }

      const previousStatus = previous.rows[0].status
      const statusChanged = previousStatus !== status
      if (statusChanged) IncidentStatusTransitions.assertCanTransition(previousStatus, status)
      if (details) {
        await client.query(
          'UPDATE incidents SET title = $2, description = $3, status = $4, updated_by = $5, updated_at = clock_timestamp() WHERE id = $1',
          [id, details.title, details.description, status, updatedBy],
        )
      } else if (statusChanged) {
        await client.query(
          'UPDATE incidents SET status = $2, updated_by = $3, updated_at = clock_timestamp() WHERE id = $1',
          [id, status, updatedBy],
        )
      }

      const { rows: [row] } = await client.query(
        `SELECT incidents.*, users.name AS reporter_name, users.email AS reporter_email,
                categories.name AS category_name, ST_Y(location) AS latitude, ST_X(location) AS longitude
         FROM incidents
         LEFT JOIN users ON users.id = incidents.created_by
         LEFT JOIN categories ON categories.code = incidents.category_code
         WHERE incidents.id = $1`, [id],
      )
      const incident = this.toDomain(row)
      const notification = statusChanged
        ? await this.recordTransition(client, incident, previousStatus, updatedBy)
        : null
      await client.query('COMMIT')
      return { incident, notification }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  async recordTransition(client, incident, previousStatus, updatedBy) {
    const { rows: [transition] } = await client.query(
      `INSERT INTO incident_status_history (incident_id, previous_status, new_status, changed_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [incident.id, previousStatus, incident.status, updatedBy],
    )
    if (!incident.createdBy) return null
    const notification = await this.notificationRepository.create(createWebNotice(incident), {
      client, transitionId: transition.id,
    })
    await client.query(
      `WITH target AS (
         SELECT notification_version FROM telegram_links
         WHERE user_id = $2 AND chat_id IS NOT NULL AND notifications_enabled FOR SHARE
       )
       INSERT INTO telegram_notification_outbox (transition_id, user_id, incident_id, status, link_version)
       SELECT $1, $2, $3, $4, notification_version FROM target`,
      [transition.id, incident.createdBy, incident.id, incident.status],
    )
    return notification
  }

  async archive(id, userId, reason) {
    const result = await this.pool.query(
      `UPDATE incidents
       SET archived_at = COALESCE(archived_at, NOW()),
           archived_by = COALESCE(archived_by, $2),
           archive_reason = COALESCE(archive_reason, $3)
       WHERE id = $1 RETURNING id`,
      [id, userId, reason],
    )
    return result.rowCount > 0
  }

  toDomain(row) {
    return new Incident({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category_code,
      categoryName: row.category_name,
      status: row.status,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
      latitude: row.latitude === null || row.latitude === undefined
        ? null
        : Number(row.latitude),
      longitude: row.longitude === null || row.longitude === undefined
        ? null
        : Number(row.longitude),
      reporter: row.reporter_name
        ? { name: row.reporter_name, email: row.reporter_email }
        : null,
      createdAt: row.created_at,
    })
  }
}

module.exports = PostgresIncidentRepository
