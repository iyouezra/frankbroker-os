-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT,
    "scope" TEXT NOT NULL,
    "roles" TEXT,
    "client_id" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_broker_id_scope_created_at_idx" ON "notifications"("broker_id", "scope", "created_at");

-- CreateIndex
CREATE INDEX "notifications_client_id_created_at_idx" ON "notifications"("client_id", "created_at");

