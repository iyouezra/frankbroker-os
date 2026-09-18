CREATE TABLE "communication_broadcasts" (
  "id" TEXT PRIMARY KEY,
  "broker_id" TEXT NOT NULL REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "request_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "segment" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'in_app',
  "instrument_id" TEXT REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "corporate_action_id" TEXT REFERENCES "corporate_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "context_label" TEXT,
  "recipient_count" INTEGER NOT NULL,
  "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "communication_broadcasts_broker_id_request_key_key" ON "communication_broadcasts"("broker_id", "request_key");
CREATE INDEX "communication_broadcasts_broker_id_sent_at_idx" ON "communication_broadcasts"("broker_id", "sent_at");
ALTER TABLE "communication_threads" ADD COLUMN "broadcast_id" TEXT REFERENCES "communication_broadcasts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "communication_threads_broadcast_id_client_id_key" ON "communication_threads"("broadcast_id", "client_id");
ALTER TABLE "communication_messages"
  ADD COLUMN "broadcast_id" TEXT REFERENCES "communication_broadcasts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "delivered_at" TIMESTAMP(3),
  ADD COLUMN "read_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "communication_messages_broadcast_id_thread_id_key" ON "communication_messages"("broadcast_id", "thread_id");
CREATE INDEX "communication_messages_broadcast_id_read_at_idx" ON "communication_messages"("broadcast_id", "read_at");
-- Historical delivery/read times are intentionally unknown; never backfill them.
