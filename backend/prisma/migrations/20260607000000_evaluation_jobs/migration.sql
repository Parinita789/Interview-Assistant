CREATE TYPE "EvaluationJobState" AS ENUM ('queued', 'running', 'completed', 'failed');

CREATE TABLE "evaluation_jobs" (
  "id" TEXT NOT NULL,
  "job_type" TEXT NOT NULL,
  "session_id" UUID NOT NULL,
  "evaluation_id" UUID,
  "phase" "Phase",
  "state" "EvaluationJobState" NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "evaluation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evaluation_jobs_session_id_state_idx" ON "evaluation_jobs"("session_id", "state");
CREATE INDEX "evaluation_jobs_evaluation_id_idx" ON "evaluation_jobs"("evaluation_id");

ALTER TABLE "evaluation_jobs"
  ADD CONSTRAINT "evaluation_jobs_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evaluation_jobs"
  ADD CONSTRAINT "evaluation_jobs_evaluation_id_fkey"
  FOREIGN KEY ("evaluation_id") REFERENCES "phase_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
