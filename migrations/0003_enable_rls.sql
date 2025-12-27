-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE holdings_locks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE balance_locks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vesting ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vesting_splits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vesting_claims ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vesting_presets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contest_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contest_lineups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE player_game_stats ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_games ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE job_execution_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bot_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bot_actions_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE premium_checkout_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE premium_orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE premium_trades ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE whop_payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tweet_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tweet_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE watch_list ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Drop existing policies
DROP POLICY IF EXISTS "Public read access" ON users;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own data" ON users;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can update own profile" ON users;
--> statement-breakpoint
DROP POLICY IF EXISTS "Public read access" ON players;
--> statement-breakpoint
DROP POLICY IF EXISTS "Public read access" ON daily_games;
--> statement-breakpoint
DROP POLICY IF EXISTS "Public read access" ON market_snapshots;
--> statement-breakpoint
DROP POLICY IF EXISTS "Public read access" ON price_history;
--> statement-breakpoint
DROP POLICY IF EXISTS "Public read access" ON blog_posts;
--> statement-breakpoint
DROP POLICY IF EXISTS "Public read access" ON contests;
--> statement-breakpoint
DROP POLICY IF EXISTS "Public read access" ON player_game_stats;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own holdings" ON holdings;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can create own orders" ON orders;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can cancel own orders" ON orders;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own trades" ON trades;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own watchlists" ON watchlists;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can manage own watchlists" ON watchlists;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own watchlist items" ON watch_list;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can manage own watchlist items" ON watch_list;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own vesting" ON vesting;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own vesting splits" ON vesting_splits;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own vesting claims" ON vesting_claims;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own vesting presets" ON vesting_presets;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can manage own vesting presets" ON vesting_presets;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own entries" ON contest_entries;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can create own entries" ON contest_entries;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own lineups" ON contest_lineups;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own snapshots" ON portfolio_snapshots;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own checkout sessions" ON premium_checkout_sessions;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own premium orders" ON premium_orders;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own premium trades" ON premium_trades;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own whop payments" ON whop_payments;
--> statement-breakpoint

-- Create Policies
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid()::text = id);
--> statement-breakpoint
CREATE POLICY "Public read access" ON users FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid()::text = id);
--> statement-breakpoint

CREATE POLICY "Public read access" ON players FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "Public read access" ON daily_games FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "Public read access" ON market_snapshots FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "Public read access" ON price_history FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "Public read access" ON blog_posts FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "Public read access" ON contests FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "Public read access" ON player_game_stats FOR SELECT USING (true);
--> statement-breakpoint

CREATE POLICY "Users can view own holdings" ON holdings FOR SELECT USING (auth.uid()::text = user_id);
--> statement-breakpoint

CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (auth.uid()::text = user_id);
--> statement-breakpoint
CREATE POLICY "Users can create own orders" ON orders FOR INSERT WITH CHECK (auth.uid()::text = user_id);
--> statement-breakpoint
CREATE POLICY "Users can cancel own orders" ON orders FOR UPDATE USING (auth.uid()::text = user_id);
--> statement-breakpoint

CREATE POLICY "Users can view own trades" ON trades FOR SELECT USING (auth.uid()::text = buyer_id OR auth.uid()::text = seller_id);
--> statement-breakpoint

CREATE POLICY "Users can view own watchlists" ON watchlists FOR SELECT USING (auth.uid()::text = user_id);
--> statement-breakpoint
CREATE POLICY "Users can manage own watchlists" ON watchlists FOR ALL USING (auth.uid()::text = user_id);
--> statement-breakpoint

CREATE POLICY "Users can view own watchlist items" ON watch_list FOR SELECT USING (auth.uid()::text = user_id);
--> statement-breakpoint
CREATE POLICY "Users can manage own watchlist items" ON watch_list FOR ALL USING (auth.uid()::text = user_id);
--> statement-breakpoint

CREATE POLICY "Users can view own vesting" ON vesting FOR SELECT USING (auth.uid()::text = user_id);
--> statement-breakpoint
CREATE POLICY "Users can view own vesting splits" ON vesting_splits FOR SELECT USING (auth.uid()::text = user_id);
--> statement-breakpoint
CREATE POLICY "Users can view own vesting claims" ON vesting_claims FOR SELECT USING (auth.uid()::text = user_id);
--> statement-breakpoint
CREATE POLICY "Users can view own vesting presets" ON vesting_presets FOR SELECT USING (auth.uid()::text = user_id);
--> statement-breakpoint
CREATE POLICY "Users can manage own vesting presets" ON vesting_presets FOR ALL USING (auth.uid()::text = user_id);
--> statement-breakpoint

CREATE POLICY "Users can view own entries" ON contest_entries FOR SELECT USING (auth.uid()::text = user_id);
--> statement-breakpoint
CREATE POLICY "Users can create own entries" ON contest_entries FOR INSERT WITH CHECK (auth.uid()::text = user_id);
--> statement-breakpoint

CREATE POLICY "Users can view own lineups" ON contest_lineups FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM contest_entries 
        WHERE contest_entries.id = contest_lineups.entry_id 
        AND contest_entries.user_id = auth.uid()::text
    )
);
--> statement-breakpoint

CREATE POLICY "Users can view own snapshots" ON portfolio_snapshots FOR SELECT USING (auth.uid()::text = user_id);
--> statement-breakpoint

CREATE POLICY "Users can view own checkout sessions" ON premium_checkout_sessions FOR SELECT USING (auth.uid()::text = user_id);
--> statement-breakpoint
CREATE POLICY "Users can view own premium orders" ON premium_orders FOR SELECT USING (auth.uid()::text = user_id);
--> statement-breakpoint
CREATE POLICY "Users can view own premium trades" ON premium_trades FOR SELECT USING (auth.uid()::text = buyer_id OR auth.uid()::text = seller_id);
--> statement-breakpoint

CREATE POLICY "Users can view own whop payments" ON whop_payments FOR SELECT USING (auth.uid()::text = user_id);
