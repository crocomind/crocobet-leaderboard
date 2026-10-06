CREATE TABLE "challenge_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_settings_single_row" CHECK ("challenge_settings"."id" = 1),
	CONSTRAINT "challenge_settings_dates_check" CHECK ("challenge_settings"."ends_at" > "challenge_settings"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "challenge_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leaderboard_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_rounds_kind_check" CHECK ("leaderboard_rounds"."kind" in ('week', 'month')),
	CONSTRAINT "leaderboard_rounds_dates_check" CHECK ("leaderboard_rounds"."ends_at" > "leaderboard_rounds"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "leaderboard_rounds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "challenge_settings" ADD CONSTRAINT "challenge_settings_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_rounds" ADD CONSTRAINT "leaderboard_rounds_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leaderboard_rounds_kind_idx" ON "leaderboard_rounds" USING btree ("kind","starts_at");