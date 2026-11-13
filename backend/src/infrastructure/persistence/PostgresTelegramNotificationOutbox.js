const TelegramNotificationOutbox = require('../../domain/ports/TelegramNotificationOutbox')

class PostgresTelegramNotificationOutbox extends TelegramNotificationOutbox {
  constructor(database) {
    super()
    this.database = database
  }

  async claim() {
    await this.database.query(
      `UPDATE telegram_notification_outbox
       SET delivery_state = 'uncertain', locked_at = NULL, last_result = 'worker_interrupted'
       WHERE delivery_state = 'processing' AND locked_at < NOW() - INTERVAL '90 seconds'`,
    )
    const { rows: [item] } = await this.database.query(
      `WITH due AS (
         SELECT candidate.transition_id FROM telegram_notification_outbox AS candidate
         WHERE candidate.delivery_state = 'pending' AND candidate.next_attempt_at <= NOW()
           AND NOT EXISTS (
             SELECT 1 FROM telegram_notification_outbox AS earlier
             WHERE earlier.incident_id = candidate.incident_id AND earlier.link_version = candidate.link_version
               AND earlier.transition_id < candidate.transition_id
               AND earlier.delivery_state IN ('pending', 'processing')
           )
         ORDER BY candidate.next_attempt_at, candidate.transition_id
         LIMIT 1 FOR UPDATE OF candidate SKIP LOCKED
       )
       UPDATE telegram_notification_outbox AS item
       SET delivery_state = 'processing', attempts = attempts + 1, locked_at = NOW()
       FROM due WHERE item.transition_id = due.transition_id
       RETURNING item.transition_id AS "transitionId", item.incident_id AS "incidentId",
                 item.status, item.attempts`,
    )
    return item
  }

  async findRecipient(item) {
    const { rows: [row] } = await this.database.query(
      `SELECT link.chat_id AS "chatId"
       FROM telegram_notification_outbox AS item
       JOIN telegram_links AS link ON link.user_id = item.user_id
       JOIN users ON users.id = item.user_id AND users.role = 'citizen'
       WHERE item.transition_id = $1 AND item.attempts = $2 AND item.delivery_state = 'processing'
         AND link.notifications_enabled AND link.notification_version = item.link_version`,
      [item.transitionId, item.attempts],
    )
    return row?.chatId
  }

  async finish(item, { state, result, retrySeconds = 0 }) {
    await this.database.query(
      `UPDATE telegram_notification_outbox AS item
       SET delivery_state = CASE WHEN $3 = 'pending' AND NOT EXISTS (
         SELECT 1 FROM telegram_links AS link
         WHERE link.user_id = item.user_id AND link.notification_version = item.link_version
           AND link.notifications_enabled AND link.chat_id IS NOT NULL
       ) THEN 'cancelled' ELSE $3 END,
           locked_at = NULL, last_result = $4,
           next_attempt_at = NOW() + make_interval(secs => $5)
       WHERE transition_id = $1 AND attempts = $2 AND delivery_state = 'processing'`,
      [item.transitionId, item.attempts, state, result, retrySeconds],
    )
  }
}

module.exports = PostgresTelegramNotificationOutbox
