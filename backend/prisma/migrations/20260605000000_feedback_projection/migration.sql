CREATE TABLE "feedback_projection_state" (
    "user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_projection_state_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "feedback_summaries" (
    "user_id" UUID NOT NULL,
    "computed_for_version" INTEGER NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "feedback_summaries_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "feedback_projection_state" ADD CONSTRAINT "feedback_projection_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback_summaries" ADD CONSTRAINT "feedback_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
