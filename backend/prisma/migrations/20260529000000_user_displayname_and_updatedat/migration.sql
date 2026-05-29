-- Add display_name (NOT NULL) — backfill legacy rows with the email
-- local-part as a sensible default; future inserts must supply one
-- via the signup DTO.
ALTER TABLE "users" ADD COLUMN "display_name" TEXT;
UPDATE "users" SET "display_name" = split_part("email", '@', 1);
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;

-- Auto-managed by Prisma's @updatedAt. Existing rows get CURRENT_TIMESTAMP;
-- inserts and updates after the migration get a fresh timestamp on every
-- write via Prisma's update logic.
ALTER TABLE "users" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
