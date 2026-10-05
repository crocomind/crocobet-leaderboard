CREATE TABLE "employee_photos" (
	"employee_id" uuid PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"etag" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entra_oid" text,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"given_name" text,
	"family_name" text,
	"department" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'employee' NOT NULL,
	"profile_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_entra_oid_unique" UNIQUE("entra_oid"),
	CONSTRAINT "employees_email_unique" UNIQUE("email"),
	CONSTRAINT "employees_role_check" CHECK ("employees"."role" in ('employee', 'admin')),
	CONSTRAINT "employees_email_lowercase" CHECK ("employees"."email" = lower("employees"."email"))
);
--> statement-breakpoint
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"reason" text,
	"note" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "post_metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"views" integer,
	"reactions" integer,
	"source" text NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
ALTER TABLE "post_metric_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"content_type" text NOT NULL,
	"category" text NOT NULL,
	"url_submitted" text NOT NULL,
	"url_canonical" text NOT NULL,
	"external_id" text,
	"title" text,
	"caption" text,
	"author_handle" text,
	"author_name" text,
	"published_at" timestamp with time zone,
	"published_at_source" text,
	"submitted_posted_at" date,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"status_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"check_status" text DEFAULT 'queued' NOT NULL,
	"check_details" jsonb,
	"checked_at" timestamp with time zone,
	"check_attempts" integer DEFAULT 0 NOT NULL,
	"last_recheck_at" timestamp with time zone,
	"views" integer,
	"reactions" integer DEFAULT 0 NOT NULL,
	"metrics_source" text DEFAULT 'provider' NOT NULL,
	"metrics_locked" boolean DEFAULT false NOT NULL,
	"metrics_fetched_at" timestamp with time zone,
	"consecutive_fetch_failures" integer DEFAULT 0 NOT NULL,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"thumbnail_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_status_check" CHECK ("posts"."status" in ('pending', 'approved', 'rejected', 'disqualified')),
	CONSTRAINT "posts_category_check" CHECK ("posts"."category" in ('video', 'static')),
	CONSTRAINT "posts_check_status_check" CHECK ("posts"."check_status" in ('queued', 'running', 'passed', 'failed', 'error')),
	CONSTRAINT "posts_metrics_check" CHECK ("posts"."reactions" >= 0 and ("posts"."views" is null or "posts"."views" >= 0))
);
--> statement-breakpoint
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"employee_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_accounts_platform_handle_pk" PRIMARY KEY("platform","handle")
);
--> statement-breakpoint
ALTER TABLE "social_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"posts_total" integer DEFAULT 0 NOT NULL,
	"posts_ok" integer DEFAULT 0 NOT NULL,
	"posts_failed" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee_photos" ADD CONSTRAINT "employee_photos_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_metric_snapshots" ADD CONSTRAINT "post_metric_snapshots_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_reviewed_by_employees_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_events_post_idx" ON "moderation_events" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "post_metric_snapshots_post_idx" ON "post_metric_snapshots" USING btree ("post_id","fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "posts_platform_external_id_key" ON "posts" USING btree ("platform","external_id") WHERE "posts"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_url_canonical_key" ON "posts" USING btree ("url_canonical");--> statement-breakpoint
CREATE INDEX "posts_board_idx" ON "posts" USING btree ("status","category","published_at");--> statement-breakpoint
CREATE INDEX "posts_employee_idx" ON "posts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "social_accounts_employee_idx" ON "social_accounts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "sync_runs_started_idx" ON "sync_runs" USING btree ("started_at" DESC NULLS LAST);