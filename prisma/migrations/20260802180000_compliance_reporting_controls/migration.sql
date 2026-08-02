ALTER TABLE "reconciliation_batches"
ADD COLUMN "reviewed_by" TEXT,
ADD COLUMN "reviewed_at" TIMESTAMP(3),
ADD COLUMN "evidence_reference" TEXT;

ALTER TABLE "service_cases"
ADD COLUMN "regulatory_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "regulatory_status_at" TIMESTAMP(3),
ADD COLUMN "regulatory_comment" TEXT;

CREATE TABLE "compliance_reports" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "client_id" TEXT,
  "report_type" TEXT NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'prepared',
  "snapshot" JSONB NOT NULL,
  "validation" JSONB NOT NULL,
  "prepared_by" TEXT NOT NULL,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "submitted_by" TEXT,
  "submitted_at" TIMESTAMP(3),
  "submission_reference" TEXT,
  "submission_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "compliance_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "compliance_escalations" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "linked_entity_type" TEXT,
  "linked_entity_id" TEXT,
  "awareness_at" TIMESTAMP(3) NOT NULL,
  "due_at" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "decision" TEXT,
  "submission_reference" TEXT,
  "submitted_at" TIMESTAMP(3),
  "created_by" TEXT NOT NULL,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "compliance_escalations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_screenings" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "screening_type" TEXT NOT NULL DEFAULT 'sanctions_pep',
  "provider" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "screened_at" TIMESTAMP(3) NOT NULL,
  "recorded_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_screenings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compliance_reports_broker_id_report_type_period_end_idx" ON "compliance_reports"("broker_id", "report_type", "period_end");
CREATE INDEX "compliance_reports_broker_id_status_created_at_idx" ON "compliance_reports"("broker_id", "status", "created_at");
CREATE INDEX "compliance_reports_client_id_created_at_idx" ON "compliance_reports"("client_id", "created_at");
CREATE INDEX "compliance_escalations_broker_id_status_due_at_idx" ON "compliance_escalations"("broker_id", "status", "due_at");
CREATE INDEX "compliance_escalations_broker_id_event_type_awareness_at_idx" ON "compliance_escalations"("broker_id", "event_type", "awareness_at");
CREATE INDEX "client_screenings_broker_id_client_id_screened_at_idx" ON "client_screenings"("broker_id", "client_id", "screened_at");
CREATE INDEX "client_screenings_broker_id_result_screened_at_idx" ON "client_screenings"("broker_id", "result", "screened_at");

ALTER TABLE "reconciliation_batches" ADD CONSTRAINT "reconciliation_batches_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compliance_reports" ADD CONSTRAINT "compliance_reports_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_reports" ADD CONSTRAINT "compliance_reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_reports" ADD CONSTRAINT "compliance_reports_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_reports" ADD CONSTRAINT "compliance_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compliance_reports" ADD CONSTRAINT "compliance_reports_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compliance_escalations" ADD CONSTRAINT "compliance_escalations_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_escalations" ADD CONSTRAINT "compliance_escalations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_escalations" ADD CONSTRAINT "compliance_escalations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_screenings" ADD CONSTRAINT "client_screenings_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_screenings" ADD CONSTRAINT "client_screenings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_screenings" ADD CONSTRAINT "client_screenings_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
