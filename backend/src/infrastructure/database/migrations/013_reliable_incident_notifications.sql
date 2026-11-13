ALTER TABLE notifications
  ADD COLUMN transition_id BIGINT UNIQUE REFERENCES incident_status_history(id) ON DELETE CASCADE;

ALTER TABLE telegram_links
  ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN notification_version UUID NOT NULL DEFAULT gen_random_uuid();

CREATE TABLE telegram_notification_outbox (
  transition_id BIGINT PRIMARY KEY REFERENCES incident_status_history(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL,
  link_version UUID NOT NULL,
  delivery_state VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (delivery_state IN ('pending', 'processing', 'sent', 'cancelled', 'failed', 'uncertain')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  last_result VARCHAR(40)
);

CREATE INDEX telegram_outbox_due_idx ON telegram_notification_outbox (next_attempt_at, transition_id)
  WHERE delivery_state = 'pending';
CREATE INDEX telegram_outbox_user_idx ON telegram_notification_outbox (user_id)
  WHERE delivery_state IN ('pending', 'processing');
CREATE INDEX telegram_outbox_processing_idx ON telegram_notification_outbox (locked_at)
  WHERE delivery_state = 'processing';
CREATE INDEX telegram_outbox_order_idx ON telegram_notification_outbox (incident_id, link_version, transition_id)
  WHERE delivery_state IN ('pending', 'processing');
