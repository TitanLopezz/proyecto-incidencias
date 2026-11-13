const IncidentAssignmentRepository = require('../../domain/ports/IncidentAssignmentRepository')

class PostgresIncidentAssignments extends IncidentAssignmentRepository {
  constructor(database) {
    super()
    this.database = database
  }

  async listOperational() {
    const { rows } = await this.database.query(
      `SELECT i.id, i.title, i.status, i.category_code AS category,
              i.created_at AS "receivedAt",
              a.contact_id AS "contactId", a.team_name AS "teamName",
              a.contact_name AS "contactName", a.assigned_at AS "assignedAt",
              a.due_at AS "dueAt", COALESCE(c.activo, FALSE) AS "contactAvailable"
       FROM incidents i
       LEFT JOIN LATERAL (
         SELECT * FROM incident_assignments WHERE incident_id = i.id ORDER BY id DESC LIMIT 1
       ) a ON TRUE
       LEFT JOIN contactos_equipo c ON c.id = a.contact_id
       WHERE i.archived_at IS NULL
       ORDER BY i.created_at, i.id`,
    )
    return rows
  }

  async findReception(id) {
    const { rows } = await this.database.query(
      'SELECT created_at FROM incidents WHERE id = $1 AND archived_at IS NULL', [id],
    )
    return rows[0]?.created_at
  }

  async assign({ id, contactId, userId, dueAt }) {
    const client = await this.database.connect()
    try {
      await client.query('BEGIN')
      const incident = await client.query(
        `SELECT id FROM incidents
         WHERE id = $1 AND archived_at IS NULL AND status IN ('abierta', 'en_proceso')
         FOR UPDATE`, [id],
      )
      if (!incident.rowCount) {
        await client.query('ROLLBACK')
        return 'incident-unavailable'
      }
      const { rows: [contact] } = await client.query(
        'SELECT id, nombre, equipo FROM contactos_equipo WHERE id = $1 AND activo FOR SHARE', [contactId],
      )
      if (!contact) {
        await client.query('ROLLBACK')
        return 'contact-unavailable'
      }
      const { rows: [previous] } = await client.query(
        'SELECT contact_id, due_at FROM incident_assignments WHERE incident_id = $1 ORDER BY id DESC LIMIT 1', [id],
      )
      if (previous?.contact_id !== contactId) {
        await client.query(
          `INSERT INTO incident_assignments
             (incident_id, contact_id, team_name, contact_name, assigned_by, due_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, contactId, contact.equipo, contact.nombre, userId, previous?.due_at ?? dueAt],
        )
      }
      await client.query('COMMIT')
      return 'assigned'
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  async history(id) {
    const { rows } = await this.database.query(
      `SELECT a.id, a.contact_id AS "contactId", a.team_name AS "teamName",
              a.contact_name AS "contactName", a.assigned_at AS "assignedAt",
              a.due_at AS "dueAt", u.name AS "assignedBy"
       FROM incident_assignments a JOIN users u ON u.id = a.assigned_by
       WHERE a.incident_id = $1 ORDER BY a.id DESC`, [id],
    )
    return rows
  }
}

module.exports = PostgresIncidentAssignments
