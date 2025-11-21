CREATE TABLE "balance_locks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"lock_type" text NOT NULL,
	"lock_reference_id" varchar NOT NULL,
	"locked_amount" numeric(20, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mining_claims" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"player_id" varchar,
	"shares_claimed" integer NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_season_summaries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"season" text DEFAULT '2024-2025-regular' NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"pts_per_game" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"reb_per_game" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"ast_per_game" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"stl_per_game" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"blk_per_game" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"tov_per_game" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"fg3_per_game" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"min_per_game" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"fg_pct" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"fg3_pct" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"ft_pct" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"fantasy_points_per_game" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "balance_locks" ADD CONSTRAINT "balance_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mining_claims" ADD CONSTRAINT "mining_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mining_claims" ADD CONSTRAINT "mining_claims_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_summaries" ADD CONSTRAINT "player_season_summaries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "balance_locks_user_idx" ON "balance_locks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "balance_locks_reference_idx" ON "balance_locks" USING btree ("lock_reference_id");--> statement-breakpoint
CREATE INDEX "balance_locks_type_idx" ON "balance_locks" USING btree ("lock_type");--> statement-breakpoint
CREATE INDEX "mining_claims_user_idx" ON "mining_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mining_claims_claimed_at_idx" ON "mining_claims" USING btree ("claimed_at");--> statement-breakpoint
CREATE INDEX "player_season_idx" ON "player_season_summaries" USING btree ("player_id","season");--> statement-breakpoint
CREATE INDEX "fantasy_points_idx" ON "player_season_summaries" USING btree ("fantasy_points_per_game");--> statement-breakpoint
CREATE INDEX "season_idx" ON "player_season_summaries" USING btree ("season");--> statement-breakpoint
CREATE INDEX "position_idx" ON "players" USING btree ("position");--> statement-breakpoint
CREATE INDEX "name_idx" ON "players" USING btree ("first_name","last_name");--> statement-breakpoint
CREATE INDEX "last_trade_price_idx" ON "players" USING btree ("last_trade_price");--> statement-breakpoint
CREATE INDEX "volume_24h_idx" ON "players" USING btree ("volume_24h");--> statement-breakpoint
CREATE INDEX "price_change_24h_idx" ON "players" USING btree ("price_change_24h");