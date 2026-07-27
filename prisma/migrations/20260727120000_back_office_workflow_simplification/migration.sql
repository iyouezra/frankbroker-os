ALTER TABLE "client_service_requests" ADD COLUMN "thread_id" TEXT;

UPDATE "client_service_requests" AS request
SET "thread_id" = thread."id"
FROM "communication_threads" AS thread
WHERE thread."broker_id" = request."broker_id"
  AND thread."client_id" = request."client_id"
  AND thread."related_type" = 'service_request'
  AND thread."related_id" = request."id";

CREATE UNIQUE INDEX "client_service_requests_thread_id_key"
ON "client_service_requests"("thread_id");

ALTER TABLE "client_service_requests"
ADD CONSTRAINT "client_service_requests_thread_id_fkey"
FOREIGN KEY ("thread_id") REFERENCES "communication_threads"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
