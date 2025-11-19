CREATE TABLE "contest_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"total_shares_entered" integer DEFAULT 0 NOT NULL,
	"total_score" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"rank" integer,
	"payout" numeric(20, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contest_lineups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"shares_entered" integer NOT NULL,
	"fantasy_points" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"earned_score" numeric(10, 2) DEFAULT '0.00' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sport" text DEFAULT 'NBA' NOT NULL,
	"contest_type" text DEFAULT '50/50' NOT NULL,
	"game_date" timestamp NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"entry_fee" numeric(20, 2) DEFAULT '0.00' NOT NULL,
	"total_shares_entered" integer DEFAULT 0 NOT NULL,
	"total_prize_pool" numeric(20, 2) DEFAULT '0.00' NOT NULL,
	"entry_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_games" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"venue" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"start_time" timestamp NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"last_fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_games_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"asset_type" text NOT NULL,
	"asset_id" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"avg_cost_basis" numeric(10, 4) DEFAULT '0.0000' NOT NULL,
	"total_cost_basis" numeric(20, 2) DEFAULT '0.00' NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings_locks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"asset_type" text NOT NULL,
	"asset_id" text NOT NULL,
	"lock_type" text NOT NULL,
	"lock_reference_id" varchar NOT NULL,
	"locked_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_execution_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" text DEFAULT 'running' NOT NULL,
	"error_message" text,
	"request_count" integer DEFAULT 0 NOT NULL,
	"records_processed" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mining" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"player_id" varchar,
	"shares_accumulated" integer DEFAULT 0 NOT NULL,
	"residual_ms" integer DEFAULT 0 NOT NULL,
	"last_accrued_at" timestamp DEFAULT now() NOT NULL,
	"last_claimed_at" timestamp,
	"cap_reached_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mining_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "mining_splits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"shares_per_hour" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"order_type" text NOT NULL,
	"side" text NOT NULL,
	"quantity" integer NOT NULL,
	"filled_quantity" integer DEFAULT 0 NOT NULL,
	"limit_price" numeric(10, 2),
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_game_stats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"game_id" text NOT NULL,
	"game_date" timestamp NOT NULL,
	"season" text DEFAULT '2024-2025-regular' NOT NULL,
	"opponent_team" text,
	"home_away" text,
	"minutes" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"three_pointers_made" integer DEFAULT 0 NOT NULL,
	"rebounds" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"steals" integer DEFAULT 0 NOT NULL,
	"blocks" integer DEFAULT 0 NOT NULL,
	"turnovers" integer DEFAULT 0 NOT NULL,
	"is_double_double" boolean DEFAULT false NOT NULL,
	"is_triple_double" boolean DEFAULT false NOT NULL,
	"fantasy_points" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"last_fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" varchar PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"team" text NOT NULL,
	"position" text NOT NULL,
	"jersey_number" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_eligible_for_mining" boolean DEFAULT true NOT NULL,
	"current_price" numeric(10, 2) DEFAULT '10.00' NOT NULL,
	"last_trade_price" numeric(10, 2),
	"volume_24h" integer DEFAULT 0 NOT NULL,
	"price_change_24h" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"volume" integer DEFAULT 0 NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"buyer_id" varchar NOT NULL,
	"seller_id" varchar NOT NULL,
	"buy_order_id" varchar,
	"sell_order_id" varchar,
	"quantity" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"username" text,
	"balance" numeric(20, 2) DEFAULT '10000.00' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"premium_expires_at" timestamp,
	"total_shares_mined" integer DEFAULT 0 NOT NULL,
	"total_market_orders" integer DEFAULT 0 NOT NULL,
	"total_trades_executed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_entries" ADD CONSTRAINT "contest_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_lineups" ADD CONSTRAINT "contest_lineups_entry_id_contest_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."contest_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_lineups" ADD CONSTRAINT "contest_lineups_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings_locks" ADD CONSTRAINT "holdings_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mining" ADD CONSTRAINT "mining_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mining" ADD CONSTRAINT "mining_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mining_splits" ADD CONSTRAINT "mining_splits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mining_splits" ADD CONSTRAINT "mining_splits_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_buy_order_id_orders_id_fk" FOREIGN KEY ("buy_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_sell_order_id_orders_id_fk" FOREIGN KEY ("sell_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contest_user_idx" ON "contest_entries" USING btree ("contest_id","user_id");--> statement-breakpoint
CREATE INDEX "entry_idx" ON "contest_lineups" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "contest_status_idx" ON "contests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "daily_games_date_idx" ON "daily_games" USING btree ("date");--> statement-breakpoint
CREATE INDEX "daily_games_status_idx" ON "daily_games" USING btree ("status");--> statement-breakpoint
CREATE INDEX "daily_games_game_date_idx" ON "daily_games" USING btree ("game_id","date");--> statement-breakpoint
CREATE INDEX "user_asset_idx" ON "holdings" USING btree ("user_id","asset_type","asset_id");--> statement-breakpoint
CREATE INDEX "locks_user_asset_idx" ON "holdings_locks" USING btree ("user_id","asset_type","asset_id");--> statement-breakpoint
CREATE INDEX "locks_reference_idx" ON "holdings_locks" USING btree ("lock_reference_id");--> statement-breakpoint
CREATE INDEX "locks_type_idx" ON "holdings_locks" USING btree ("lock_type");--> statement-breakpoint
CREATE INDEX "job_name_idx" ON "job_execution_logs" USING btree ("job_name");--> statement-breakpoint
CREATE INDEX "scheduled_idx" ON "job_execution_logs" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "user_split_idx" ON "mining_splits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "player_side_idx" ON "orders" USING btree ("player_id","side","status");--> statement-breakpoint
CREATE INDEX "user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "player_game_idx" ON "player_game_stats" USING btree ("player_id","game_id");--> statement-breakpoint
CREATE INDEX "team_idx" ON "players" USING btree ("team");--> statement-breakpoint
CREATE INDEX "active_idx" ON "players" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "player_time_idx" ON "price_history" USING btree ("player_id","timestamp");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "player_trade_idx" ON "trades" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "executed_idx" ON "trades" USING btree ("executed_at");