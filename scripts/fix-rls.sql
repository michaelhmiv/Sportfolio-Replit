
-- Enable RLS on all tables and set up policies
-- Run this via scripts/run-rls.ts

-- 1. Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE vesting ENABLE ROW LEVEL SECURITY;
ALTER TABLE vesting_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE vesting_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE vesting_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_game_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_actions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE premium_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE premium_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE premium_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE whop_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tweet_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tweet_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_list ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts
-- Users
DROP POLICY IF EXISTS "Public read access" ON users;
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
-- Public Data
DROP POLICY IF EXISTS "Public read access" ON players;
DROP POLICY IF EXISTS "Public read access" ON daily_games;
DROP POLICY IF EXISTS "Public read access" ON market_snapshots;
DROP POLICY IF EXISTS "Public read access" ON price_history;
DROP POLICY IF EXISTS "Public read access" ON blog_posts;
DROP POLICY IF EXISTS "Public read access" ON contests;
DROP POLICY IF EXISTS "Public read access" ON player_game_stats;
-- Holdings
DROP POLICY IF EXISTS "Users can view own holdings" ON holdings;
-- Orders
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can create own orders" ON orders;
DROP POLICY IF EXISTS "Users can cancel own orders" ON orders;
-- Trades
DROP POLICY IF EXISTS "Users can view own trades" ON trades;
-- Watchlists
DROP POLICY IF EXISTS "Users can view own watchlists" ON watchlists;
DROP POLICY IF EXISTS "Users can manage own watchlists" ON watchlists;
DROP POLICY IF EXISTS "Users can view own watchlist items" ON watch_list;
DROP POLICY IF EXISTS "Users can manage own watchlist items" ON watch_list;
-- Vesting
DROP POLICY IF EXISTS "Users can view own vesting" ON vesting;
DROP POLICY IF EXISTS "Users can view own vesting splits" ON vesting_splits;
DROP POLICY IF EXISTS "Users can view own vesting claims" ON vesting_claims;
DROP POLICY IF EXISTS "Users can view own vesting presets" ON vesting_presets;
DROP POLICY IF EXISTS "Users can manage own vesting presets" ON vesting_presets;
-- Contest Entries
DROP POLICY IF EXISTS "Users can view own entries" ON contest_entries;
DROP POLICY IF EXISTS "Users can create own entries" ON contest_entries;
-- Contest Lineups
DROP POLICY IF EXISTS "Users can view own lineups" ON contest_lineups;
-- Portfolio Snapshots
DROP POLICY IF EXISTS "Users can view own snapshots" ON portfolio_snapshots;
-- Premium
DROP POLICY IF EXISTS "Users can view own checkout sessions" ON premium_checkout_sessions;
DROP POLICY IF EXISTS "Users can view own premium orders" ON premium_orders;
DROP POLICY IF EXISTS "Users can view own premium trades" ON premium_trades;
-- Whop
DROP POLICY IF EXISTS "Users can view own whop payments" ON whop_payments;


-- 3. Create Policies

-- Users
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid()::text = id);
CREATE POLICY "Public read access" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid()::text = id);

-- Public Data Tables (Read Only for everyone)
CREATE POLICY "Public read access" ON players FOR SELECT USING (true);
CREATE POLICY "Public read access" ON daily_games FOR SELECT USING (true);
CREATE POLICY "Public read access" ON market_snapshots FOR SELECT USING (true);
CREATE POLICY "Public read access" ON price_history FOR SELECT USING (true);
CREATE POLICY "Public read access" ON blog_posts FOR SELECT USING (true);
CREATE POLICY "Public read access" ON contests FOR SELECT USING (true);
CREATE POLICY "Public read access" ON player_game_stats FOR SELECT USING (true);

-- User-Specific Data (Own Data Only)

-- Holdings
CREATE POLICY "Users can view own holdings" ON holdings FOR SELECT USING (auth.uid()::text = user_id);

-- Orders
CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can create own orders" ON orders FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can cancel own orders" ON orders FOR UPDATE USING (auth.uid()::text = user_id);

-- Trades
CREATE POLICY "Users can view own trades" ON trades FOR SELECT USING (auth.uid()::text = buyer_id OR auth.uid()::text = seller_id);

-- Watchlists
CREATE POLICY "Users can view own watchlists" ON watchlists FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can manage own watchlists" ON watchlists FOR ALL USING (auth.uid()::text = user_id);

CREATE POLICY "Users can view own watchlist items" ON watch_list FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can manage own watchlist items" ON watch_list FOR ALL USING (auth.uid()::text = user_id);

-- Vesting
CREATE POLICY "Users can view own vesting" ON vesting FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view own vesting splits" ON vesting_splits FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view own vesting claims" ON vesting_claims FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view own vesting presets" ON vesting_presets FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can manage own vesting presets" ON vesting_presets FOR ALL USING (auth.uid()::text = user_id);

-- Contest Entries
CREATE POLICY "Users can view own entries" ON contest_entries FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can create own entries" ON contest_entries FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Lineups (linked to entries)
CREATE POLICY "Users can view own lineups" ON contest_lineups FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM contest_entries 
        WHERE contest_entries.id = contest_lineups.entry_id 
        AND contest_entries.user_id = auth.uid()::text
    )
);

-- Portfolio Snapshots
CREATE POLICY "Users can view own snapshots" ON portfolio_snapshots FOR SELECT USING (auth.uid()::text = user_id);

-- Premium
CREATE POLICY "Users can view own checkout sessions" ON premium_checkout_sessions FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view own premium orders" ON premium_orders FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view own premium trades" ON premium_trades FOR SELECT USING (auth.uid()::text = buyer_id OR auth.uid()::text = seller_id);

-- Whop Payments
CREATE POLICY "Users can view own whop payments" ON whop_payments FOR SELECT USING (auth.uid()::text = user_id);


SELECT 'RLS policies applied successfully' AS status;
