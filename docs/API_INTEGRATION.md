# API Integration Guide

This document describes the external APIs used by Sportfolio for sports data.

## Overview

| API | Sport | Data Provided | Rate Limits |
|-----|-------|---------------|-------------|
| MySportsFeeds | NBA | Roster, Schedule, Stats | 200/5min (token bucket) |
| Ball Don't Lie | NFL | Roster, Schedule, Stats | 60/min (GOAT tier) |

---

## Ball Don't Lie NFL API

**Base URL:** `https://api.balldontlie.io/nfl/v1`  
**Auth:** Bearer token via `Authorization` header  
**Tier:** GOAT (60 requests/minute)

### Endpoints Used

| Endpoint | Purpose | Used By |
|----------|---------|---------|
| `/players/active` | Fetch all NFL players | `sync-nfl-roster.ts` |
| `/games` | Fetch game schedules | `sync-nfl-schedule.ts` |
| `/stats` | Fetch player game stats | `sync-nfl-stats.ts` |
| `/season_stats` | Fetch season aggregates | (not currently used) |
| `/player_injuries` | Fetch injury reports | `sync-nfl-roster.ts` |

### Authentication

Set `BALLDONTLIE_API_KEY` environment variable.

### Rate Limiting

Implemented in `server/jobs/rate-limiter.ts` as `BallDontLieRateLimiter`:
- Token bucket algorithm: 60 tokens, refills over 1 minute
- Automatic retry with exponential backoff on 429/5xx errors

---

## MySportsFeeds API

**Base URL:** `https://api.mysportsfeeds.com/v2.1/pull`  
**Auth:** Basic auth (API key as username, `MYSPORTSFEEDS` as password)  
**Tier:** Standard (200 requests per 5 minutes)

### Endpoints Used

| Endpoint | Purpose | Used By |
|----------|---------|---------|
| `/nba/{season}/players.json` | Fetch NBA players | `sync-roster.ts` |
| `/nba/{season}/games.json` | Fetch game schedules | `sync-schedule.ts` |
| `/nba/{season}/player_gamelogs.json` | Fetch player stats | `sync-stats.ts`, `sync-stats-live.ts` |

### Rate Limiting

Implemented in `server/jobs/rate-limiter.ts` as `MySportsFeedsRateLimiter`:
- Token bucket: 150 tokens (conservative), refills over 5 minutes
- 5-second mandatory backoff between Daily Player Gamelogs requests

---

## Environment Variables

```bash
# Required
BALLDONTLIE_API_KEY=your_ball_dont_lie_key
MYSPORTSFEEDS_API_KEY=your_mysportsfeeds_key

# Optional debugging
DEBUG_API=true  # Enables verbose API logging
```

---

## Troubleshooting

### "NFL features disabled" warning
- Check that `BALLDONTLIE_API_KEY` is set in environment
- Verify key is valid at https://balldontlie.io/account

### API rate limit errors (429)
- Rate limiters should automatically retry with backoff
- Check logs for "retrying in Xms" messages
- Consider reducing sync frequency if persistent

### Missing NFL scores
1. Check job logs for `nfl_schedule_sync` and `stats_sync_live`
2. Query database: `SELECT * FROM daily_games WHERE sport='NFL'`
3. Verify games have status other than "scheduled"
