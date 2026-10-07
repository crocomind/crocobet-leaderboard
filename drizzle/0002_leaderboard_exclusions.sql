CREATE TABLE "leaderboard_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid,
	"employee_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_exclusions_board_employee" UNIQUE NULLS NOT DISTINCT("round_id","employee_id")
);
--> statement-breakpoint
ALTER TABLE "leaderboard_exclusions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leaderboard_exclusions" ADD CONSTRAINT "leaderboard_exclusions_round_id_leaderboard_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."leaderboard_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_exclusions" ADD CONSTRAINT "leaderboard_exclusions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_exclusions" ADD CONSTRAINT "leaderboard_exclusions_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;