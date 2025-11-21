# MySportsFeeds API Throttling Documentation

## Overview
MySportsFeeds implements two throttling conditions:
1. **Backoff delays** between requests for certain feeds
2. **Request limit** of 100 per 1-minute interval

Both violations return HTTP 429 (Too Many Requests).

## Backoff Delays (v2.x feeds)

### 30 Second Backoff
- Seasonal DFS
- **Seasonal Player Gamelogs** ⚠️ (used by old sync job - AVOIDED)
- Seasonal Player Stats Projections
- Seasonal Game Lines
- Daily Futures

### 15 Second Backoff
- Daily/Weekly Game Lines

### 5 Second Backoff
- Daily/Weekly Player Gamelogs
- Daily/Weekly Team Gamelogs
- Daily/Weekly DFS
- Daily/Weekly Player Gamelogs Projections
- Daily/Weekly DFS Projections
- Player Injuries
- Injury History
- Seasonal Team Stats
- **Seasonal Player Stats** ⚠️
- **Players** ⚠️
- Seasonal Standings

### No Backoff
- **Game-specific feeds** (individual game data) ✅ USED BY SPORTFOLIO

## Request Limit Calculation

Each request counts as: `1 + backoff_seconds`

Examples:
- Game-specific feed: counts as **1**
- 5-second backoff feed: counts as **6** (1 + 5)
- 30-second backoff feed: counts as **31** (1 + 30)

**Limit per minute: 100**

This means:
- Seasonal Player Gamelogs: ~3 requests/minute max (31 × 3 = 93)
- Seasonal Player Stats: ~16 requests/minute max (6 × 16 = 96)
- Game-specific feeds: 100 requests/minute max

## Sportfolio's Solution

### Problem
Original approach called Seasonal Player Gamelogs endpoint:
- 470 active players to sync
- 30-second backoff required
- Each request counts as 31 toward limit
- **Minimum time: 470 × 30s = 14,100s = 3.9 hours per run**
- Impossible to maintain fresh daily stats

### Solution: Database Aggregation
Instead of calling API for season stats, aggregate from existing game data:

1. **Use game-specific feeds** (no backoff) via `stats_sync` and `stats_sync_live`
2. **Calculate season averages** from `player_game_stats` table using SQL
3. **Recalculate after each game sync** to keep data fresh
4. **Fallback to API** only for players with no game data (<50 calls/day)

**Benefits:**
- ✅ No rate limiting issues (local DB queries)
- ✅ Always fresh (updates after every game)
- ✅ Instant calculations (SQL aggregations)
- ✅ Minimal API usage

## References
Source: https://www.mysportsfeeds.com/data-feeds/api-docs/#throttling
Last Updated: November 2025
