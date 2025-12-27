-- Enable Row Level Security on all tables
-- Run this in Supabase SQL Editor

-- Enable RLS on all tables
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

-- Since your backend connects with the service_role key, it bypasses RLS automatically.
-- These policies are for defense-in-depth and if you ever expose the anon key to clients.

-- Policy: Allow service_role full access to all tables (backend server)
-- The service_role key automatically bypasses RLS, so no explicit policy needed.

-- Policy: Deny all access via anon key (no direct client access)
-- By enabling RLS without any policies, tables are locked down by default.

-- If you need specific policies for authenticated users via Supabase Auth:
-- Example: Users can only see their own data
-- CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid()::text = id);

-- For now, with RLS enabled and no policies, only service_role can access the tables.
-- This is the most secure default for a backend-only architecture.

SELECT 'RLS enabled on all tables. Only service_role can access data.' AS status;
