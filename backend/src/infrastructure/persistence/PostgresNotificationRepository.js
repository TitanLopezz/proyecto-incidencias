const NotificationRepository = require('../../domain/ports/NotificationRepository')
const Notification = require('../../domain/entities/Notification')

class PostgresNotificationRepository extends NotificationRepository {
  constructor(pool) {
    super()
    this.pool = pool
  }

  async create(notification, { client = this.pool, transitionId = null } = {}) {
    const result = await client.query(
      `INSERT INTO notifications (user_id, incident_id, message, is_read, transition_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, incident_id, message, is_read, created_at`,
      [notification.userId, notification.incidentId, notification.message, notification.isRead, transitionId],
    )

    return this.toDomain(result.rows[0])
  }

  async findByUserId(userId) {
    const result = await this.pool.query(
      `SELECT id, user_id, incident_id, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [userId],
    )

    return result.rows.map((row) => this.toDomain(row))
  }

  async markAsRead(id, userId) {
    const result = await this.pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, incident_id, message, is_read, created_at`,
      [id, userId],
    )

    return result.rows[0] ? this.toDomain(result.rows[0]) : null
  }

  toDomain(row) {
    return Notification.create({
      id: row.id,
      userId: row.user_id,
      incidentId: row.incident_id,
      message: row.message,
      isRead: row.is_read,
      createdAt: row.created_at,
    })
  }
}

module.exports = PostgresNotificationRepository
