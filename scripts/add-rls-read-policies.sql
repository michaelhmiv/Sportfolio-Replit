-- Add RLS read policies for public tables
-- Run this in Supabase SQL Editor to fix the "no players found" issue
-- 
-- The problem: enable-rls.sql enabled RLS on all tables but didn't add policies.
-- When using the connection pooler (Supavisor), the service_role bypass doesn't work
-- automatically, so queries return 0 rows.
--
-- This script adds SELECT policies for tables containing public data.

-- ============================================================================
-- PUBLIC DATA TABLES (anyone can read)
-- ============================================================================

-- Players - core public data
CREATE POLICY "Allow public read on players" 
  ON players 
  FOR SELECT 
  USING (true);

-- Daily games schedule - public
CREATE POLICY "Allow public read on daily_games" 
  ON daily_games 
  FOR SELECT 
  USING (true);

-- Player game stats - public performance data
CREATE POLICY "Allow public read on player_game_stats" 
  ON player_game_stats 
  FOR SELECT 
  USING (true);

-- Contests - public contest listings
CREATE POLICY "Allow public read on contests" 
  ON contests 
  FOR SELECT 
  USING (true);

-- Price history - public market data
CREATE POLICY "Allow public read on price_history" 
  ON price_history 
  FOR SELECT 
  USING (true);

-- Market snapshots - public aggregate market data
CREATE POLICY "Allow public read on market_snapshots" 
  ON market_snapshots 
  FOR SELECT 
  USING (true);

-- Blog posts - public content
CREATE POLICY "Allow public read on blog_posts" 
  ON blog_posts 
  FOR SELECT 
  USING (true);

-- Orders - public order book data (needed for bid/ask display)
CREATE POLICY "Allow public read on orders" 
  ON orders 
  FOR SELECT 
  USING (true);

-- Trades - public trade history
CREATE POLICY "Allow public read on trades" 
  ON trades 
  FOR SELECT 
  USING (true);

-- ============================================================================
-- SERVICE-ONLY TABLES (already protected by no policies - leave as is)
-- ============================================================================
-- users, sessions, holdings, holdings_locks, balance_locks, vesting, 
-- vesting_splits, vesting_claims, vesting_presets, contest_entries,
-- contest_lineups, job_execution_logs, portfolio_snapshots, bot_profiles,
-- bot_actions_log, premium_checkout_sessions, premium_orders, premium_trades,
-- whop_payments, tweet_settings, tweet_history

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
