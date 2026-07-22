CREATE TABLE IF NOT EXISTS "gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"points_cost" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"stock_level" integer,
	"image_emoji" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gifts_points_cost_check" CHECK ("gifts"."points_cost" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "points_balances" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "points_balances_balance_check" CHECK ("points_balances"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "points_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_type" text NOT NULL,
	"points" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "points_ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "points_ledger_entry_type_check" CHECK ("points_ledger"."entry_type" in ('credit','debit')),
	CONSTRAINT "points_ledger_points_check" CHECK ("points_ledger"."points" > 0),
	CONSTRAINT "points_ledger_source_type_check" CHECK ("points_ledger"."source_type" in ('receipt','redemption','adjustment'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"description" text,
	"unit_price" numeric(10, 2) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"content_hash" text NOT NULL,
	"merchant_name" text,
	"receipt_total" numeric(10, 2),
	"tax_amount" numeric(10, 2),
	"tip_amount" numeric(10, 2),
	"purchase_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"fingerprint_hash" text,
	"ocr_raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "uq_receipts_user_content_hash" UNIQUE("user_id","content_hash"),
	CONSTRAINT "receipts_status_check" CHECK ("receipts"."status" in ('pending','processed','rejected','duplicate','flagged_for_review')),
	CONSTRAINT "receipts_total_check" CHECK ("receipts"."receipt_total" is null or "receipts"."receipt_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "redemption_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"gift_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"points_cost_each" integer NOT NULL,
	CONSTRAINT "redemption_order_items_quantity_check" CHECK ("redemption_order_items"."quantity" > 0),
	CONSTRAINT "redemption_order_items_points_check" CHECK ("redemption_order_items"."points_cost_each" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "redemption_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"total_points_cost" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tracking_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fulfilled_at" timestamp with time zone,
	CONSTRAINT "redemption_orders_total_check" CHECK ("redemption_orders"."total_points_cost" > 0),
	CONSTRAINT "redemption_orders_status_check" CHECK ("redemption_orders"."status" in ('pending','fulfilled','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "points_balances" ADD CONSTRAINT "points_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_order_items" ADD CONSTRAINT "redemption_order_items_order_id_redemption_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."redemption_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_order_items" ADD CONSTRAINT "redemption_order_items_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemption_orders" ADD CONSTRAINT "redemption_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_points_ledger_user" ON "points_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_receipt_items_receipt" ON "receipt_items" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_receipts_fingerprint_hash" ON "receipts" USING btree ("fingerprint_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_receipts_user" ON "receipts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_redemption_order_items_order" ON "redemption_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_redemption_orders_user" ON "redemption_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_user" ON "sessions" USING btree ("user_id");