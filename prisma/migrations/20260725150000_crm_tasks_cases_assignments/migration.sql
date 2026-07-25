-- CreateTable
CREATE TABLE "crm_tasks" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "case_id" TEXT,
    "related_type" TEXT,
    "related_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "task_type" TEXT NOT NULL DEFAULT 'follow_up',
    "assigned_to_user_id" TEXT,
    "created_by_user_id" TEXT,
    "due_date" DATE,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "completed_by_user_id" TEXT,
    "completion_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_cases" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "category" TEXT NOT NULL DEFAULT 'complaint',
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'new',
    "subject" TEXT NOT NULL,
    "assigned_to_user_id" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "target_resolution_at" TIMESTAMP(3),
    "internal_findings" TEXT,
    "resolution_summary" TEXT,
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_assignments" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "primary_officer_id" TEXT,
    "backup_officer_id" TEXT,
    "team" TEXT,
    "branch" TEXT,
    "note" TEXT,
    "assigned_by_user_id" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_tasks_broker_id_status_due_date_idx" ON "crm_tasks"("broker_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "crm_tasks_broker_id_assigned_to_user_id_status_idx" ON "crm_tasks"("broker_id", "assigned_to_user_id", "status");

-- CreateIndex
CREATE INDEX "crm_tasks_client_id_created_at_idx" ON "crm_tasks"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "crm_tasks_thread_id_idx" ON "crm_tasks"("thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_cases_thread_id_key" ON "service_cases"("thread_id");

-- CreateIndex
CREATE INDEX "service_cases_broker_id_status_opened_at_idx" ON "service_cases"("broker_id", "status", "opened_at");

-- CreateIndex
CREATE INDEX "service_cases_client_id_opened_at_idx" ON "service_cases"("client_id", "opened_at");

-- CreateIndex
CREATE INDEX "investor_assignments_broker_id_client_id_assigned_at_idx" ON "investor_assignments"("broker_id", "client_id", "assigned_at");

-- CreateIndex
CREATE INDEX "investor_assignments_broker_id_primary_officer_id_ended_at_idx" ON "investor_assignments"("broker_id", "primary_officer_id", "ended_at");

-- CreateIndex
CREATE INDEX "investor_assignments_client_id_ended_at_idx" ON "investor_assignments"("client_id", "ended_at");

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "communication_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "service_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "communication_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_assignments" ADD CONSTRAINT "investor_assignments_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_assignments" ADD CONSTRAINT "investor_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_assignments" ADD CONSTRAINT "investor_assignments_primary_officer_id_fkey" FOREIGN KEY ("primary_officer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_assignments" ADD CONSTRAINT "investor_assignments_backup_officer_id_fkey" FOREIGN KEY ("backup_officer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_assignments" ADD CONSTRAINT "investor_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

