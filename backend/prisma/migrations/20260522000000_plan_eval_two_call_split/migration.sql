-- Two-call eval split: Call A persists the row with score + results;
-- Call B patches the detail fields and stamps details_completed_at.
-- Frontend polls until details_completed_at or details_error is non-null.
ALTER TABLE "phase_evaluations"
  ADD COLUMN "details_completed_at" TIMESTAMP(3),
  ADD COLUMN "details_error"        TEXT,
  ADD COLUMN "details_audit"        JSONB;
