const ConflictError = require('../../domain/errors/ConflictError')

class PostgresTelegramLinks {
  constructor(database) {
    this.database = database
  }

  async storeCode(userId, hash) {
    await this.database.query(
      `INSERT INTO telegram_links (user_id, code_hash, code_expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (user_id) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, code_expires_at = EXCLUDED.code_expires_at`,
      [userId, hash],
    )
  }

  async redeem(hash, chatId) {
    try {
      const result = await this.database.query(
        `WITH linked AS (
           UPDATE telegram_links AS link
           SET chat_id = $2::varchar, code_hash = NULL, code_expires_at = NULL,
               notifications_enabled = link.chat_id IS NOT DISTINCT FROM $2::varchar AND link.notifications_enabled,
               notification_version = CASE WHEN link.chat_id IS DISTINCT FROM $2::varchar
                 THEN gen_random_uuid() ELSE link.notification_version END
           FROM users
           WHERE link.code_hash = $1 AND link.code_expires_at > NOW()
             AND users.id = link.user_id AND users.role = 'citizen'
           RETURNING link.user_id, link.notification_version
         ), cancelled AS (
           UPDATE telegram_notification_outbox AS item
           SET delivery_state = 'cancelled', last_result = 'link_changed'
           FROM linked
           WHERE item.user_id = linked.user_id AND item.link_version <> linked.notification_version
             AND item.delivery_state = 'pending'
         )
         SELECT user_id FROM linked`,
        [hash, chatId],
      )
      return result.rowCount === 1
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'telegram_links_chat_id_key') {
        throw new ConflictError('Este chat ya está vinculado a otra cuenta. Desvincúlalo desde esa cuenta antes de continuar.')
      }
      throw error
    }
  }

  async findCitizen(chatId) {
    const { rows } = await this.database.query(
      `SELECT users.id
       FROM telegram_links JOIN users ON users.id = telegram_links.user_id
       WHERE telegram_links.chat_id = $1 AND users.role = 'citizen'`,
      [chatId],
    )
    return rows[0]?.id
  }

  async unlink(userId) {
    await this.database.query(
      `WITH removed AS (DELETE FROM telegram_links WHERE user_id = $1 RETURNING user_id)
       UPDATE telegram_notification_outbox AS item
       SET delivery_state = 'cancelled', last_result = 'unlinked'
       FROM removed WHERE item.user_id = removed.user_id AND item.delivery_state = 'pending'`,
      [userId],
    )
  }

  async getPreference(userId) {
    const { rows: [row] } = await this.database.query(
      'SELECT chat_id IS NOT NULL AS linked, notifications_enabled AS enabled FROM telegram_links WHERE user_id = $1',
      [userId],
    )
    return row ?? { linked: false, enabled: false }
  }

  async setPreference(userId, enabled) {
    const { rows: [row] } = await this.database.query(
      `WITH preference AS (
         UPDATE telegram_links
         SET notifications_enabled = $2,
             notification_version = CASE WHEN notifications_enabled IS DISTINCT FROM $2
               THEN gen_random_uuid() ELSE notification_version END
         WHERE user_id = $1 AND chat_id IS NOT NULL
         RETURNING user_id, notifications_enabled AS enabled
       ), cancelled AS (
         UPDATE telegram_notification_outbox AS item
         SET delivery_state = 'cancelled', last_result = 'opted_out'
         FROM preference
         WHERE item.user_id = preference.user_id AND NOT preference.enabled AND item.delivery_state = 'pending'
       )
       SELECT TRUE AS linked, enabled FROM preference`,
      [userId, enabled],
    )
    return row
  }
}

module.exports = PostgresTelegramLinks
