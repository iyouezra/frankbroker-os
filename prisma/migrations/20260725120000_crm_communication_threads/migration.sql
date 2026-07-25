-- CreateTable
CREATE TABLE "communication_threads" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "account_id" TEXT,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "related_type" TEXT,
    "related_id" TEXT,
    "assigned_to_user_id" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_preview" TEXT,
    "broker_unread_count" INTEGER NOT NULL DEFAULT 0,
    "investor_unread_count" INTEGER NOT NULL DEFAULT 0,
    "opened_by" TEXT NOT NULL DEFAULT 'investor',
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'shared',
    "author_type" TEXT NOT NULL,
    "author_user_id" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_attachments" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'shared',
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_attachment_contents" (
    "attachment_id" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "communication_attachment_contents_pkey" PRIMARY KEY ("attachment_id")
);

-- CreateIndex
CREATE INDEX "communication_threads_broker_id_status_last_message_at_idx" ON "communication_threads"("broker_id", "status", "last_message_at");

-- CreateIndex
CREATE INDEX "communication_threads_client_id_last_message_at_idx" ON "communication_threads"("client_id", "last_message_at");

-- CreateIndex
CREATE INDEX "communication_threads_broker_id_assigned_to_user_id_status_idx" ON "communication_threads"("broker_id", "assigned_to_user_id", "status");

-- CreateIndex
CREATE INDEX "communication_threads_related_type_related_id_idx" ON "communication_threads"("related_type", "related_id");

-- CreateIndex
CREATE INDEX "communication_messages_thread_id_visibility_created_at_idx" ON "communication_messages"("thread_id", "visibility", "created_at");

-- CreateIndex
CREATE INDEX "communication_attachments_thread_id_visibility_idx" ON "communication_attachments"("thread_id", "visibility");

-- CreateIndex
CREATE INDEX "communication_attachments_broker_id_uploaded_at_idx" ON "communication_attachments"("broker_id", "uploaded_at");

-- AddForeignKey
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "communication_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_attachments" ADD CONSTRAINT "communication_attachments_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "communication_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_attachments" ADD CONSTRAINT "communication_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "communication_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_attachment_contents" ADD CONSTRAINT "communication_attachment_contents_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "communication_attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
