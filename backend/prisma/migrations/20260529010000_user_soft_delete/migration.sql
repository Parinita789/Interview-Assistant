-- Soft-delete: a non-null timestamp means the user has self-deleted.
-- UsersRepository's default finders filter on deleted_at IS NULL so
-- the soft-deleted user becomes unreachable to login + /auth/me +
-- the signup uniqueness pre-check. The email column's @unique stays —
-- a soft-deleted user's email is permanently taken (re-signup → 409).
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Index so "alive users" queries stay fast as the table grows. Most
-- queries are by id (PK) + the new filter; this index keeps the
-- planner happy.
CREATE INDEX "users_deleted_at_idx" ON "users" ("deleted_at");
