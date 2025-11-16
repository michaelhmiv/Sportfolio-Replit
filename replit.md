# Sportfolio - Fantasy Sports Stock Market Platform

## Overview

Sportfolio is a fantasy sports trading platform that gamifies NBA player performance. It allows users to trade player shares like stocks, combining real-time sports data with financial trading mechanics. Key features include player share mining, 50/50 contests, and a professional-grade trading interface inspired by platforms like Robinhood and Bloomberg Terminal. The project aims to create an engaging experience for sports fans, offering a unique blend of fantasy sports and financial market dynamics.

## User Preferences

Preferred communication style: Simple, everyday language.

**CRITICAL RULE: Never use mock, sample, or placeholder data under any circumstances.** All data must come from live API sources (MySportsFeeds). If API data is unavailable, show empty states or loading indicators - never fabricate data.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React with TypeScript, Vite, Wouter for routing, TanStack Query for server state.
- Shadcn/ui component library built on Radix UI, Tailwind CSS for styling.

**Design System:**
- Custom design tokens follow a Robinhood/Bloomberg hybrid.
- Typography: Inter for UI, JetBrains Mono for financial data.
- Trading-specific color palette with positive/negative indicators.

**Key UI Patterns:**
- Sidebar navigation, real-time market ticker, card-based layouts.
- Responsive widgets (e.g., Today's Games adapts to mobile/desktop).
- Mining widget with enhanced player selection (search, filters, on-demand stats).
- Client-side real-time share projection matching backend logic, animated progress bar.
- Tabbed interfaces, modal dialogs for interactions, WebSocket for live data.

**Mobile-Responsive Patterns:**
- Optimized for no horizontal scrolling on mobile.
- Uses `sm:` breakpoint (640px) to switch between card-based (mobile) and table-based (desktop) layouts for data views (Marketplace, Portfolio, Contests).
- Bottom navigation for mobile, sidebar for desktop. Primary branding color is green.

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript, HTTP server with WebSocket support.

**Data Layer:**
- Drizzle ORM, PostgreSQL (Neon serverless), Zod validation.

**Core Domain Models:**
- Users, Players, Holdings, Orders, Trades, Mining (100 shares/hour, 2,400 cap, precise accrual via `lastAccruedAt`), Contests, Price History.

**API Design:**
- RESTful endpoints (players, orders, contests, portfolio).
- WebSocket for live price and trade updates.
- Aggregated dashboard endpoint.

### Database Schema

**Key Tables:**
- `users`, `players`, `holdings`, `orders`, `trades`, `mining`, `contests`, `contest_entries`, `contest_lineups`, `player_game_stats`, `price_history`.
- Indexing strategy focuses on user-asset relationships, player filtering, and order book queries.

## External Dependencies

**MySportsFeeds API Integration:**
- NBA player roster and game stats synchronization using STATS-tier endpoints.
- Uses `/date/{YYYYMMDD}/player_gamelogs.json` for game stats (not `/boxscore.json` which requires higher tier).
- Real-time game statistics for scoring.
- Player stats endpoints: `/api/player/:id/stats` (season averages) and `/api/player/:id/recent-games` (last 5 games).
- All data directly from MySportsFeeds Core + Stats subscription (no mock data).
- Box score data fetched using player_gamelogs endpoint with game filter parameter.

**MySportsFeeds Throttling Requirements:**
- **Daily/Weekly Player Gamelogs**: 5-second backoff required between requests
- **Request limit**: 100 requests per minute (each request with backoff counts as backoff_seconds + 1)
- **Implementation**: Sync jobs now include proper 5-second delays between game fetches
- Player gamelogs request cost: 5 (backoff) + 1 (request) = 6 points per game
- Maximum games per minute: ~16 games (100 / 6)

**Third-Party Services:**
- Neon Database (PostgreSQL).
- WebSocket server for real-time updates.
- Google Fonts CDN.

**Authentication:**
- Simplified session-based (MVP), with demo user creation. Placeholder for future OAuth.

**Real-Time Features:**
- WebSocket server (`/ws`) for live updates, central broadcast mechanism.
- Live game stats polling (1 min) and `contestUpdate` events.
- Frontend auto-invalidates React Query cache.

**Background Jobs (Cron):**
- `roster_sync`: Daily (5 AM ET).
- `schedule_sync`: Every minute (fetches live game scores, broadcasts WebSocket updates).
- `stats_sync`: Hourly (completed games).
- `stats_sync_live`: Every minute (in-progress games, requires Live subscription - currently returns 403).
- `settle_contests`: Every 5 minutes (settles contests, distributes prizes).

**Contest Scoring Mechanics:**
- **Proportional Share-Dilution Model:** Fantasy points distributed based on ownership percentage within a contest.
- **50/50 Contests:** Top 50% entries win, prize pool distributed proportionally.

## MySportsFeeds API Documentation

### NBA API (v2.1) - Currently Implemented

**Available Endpoints (with CORE + STATS subscription):**

1. **DAILY PLAYER GAMELOGS** - Player stats for a specific date
   - URL: `https://api.mysportsfeeds.com/v2.1/pull/nba/{season}/date/{date}/player_gamelogs.json`
   - Parameters: `team`, `player`, `position`, `game`, `stats`, `sort`, `offset`, `limit`
   - Use: Get player game stats for a specific date
   - Addon Required: STATS

2. **DAILY GAMES** - All games on a given date with schedule, status, and scores
   - URL: `https://api.mysportsfeeds.com/v2.1/pull/nba/{season}/date/{date}/games.json`
   - Parameters: `team`, `status`, `sort`, `offset`, `limit`
   - Use: Current implementation uses this for game schedule and live scores
   - Addon Required: CORE (included)

3. **SEASONAL PLAYER STATS** - Player seasonal stats totals
   - URL: `https://api.mysportsfeeds.com/v2.1/pull/nba/{season}/player_stats_totals.json`
   - Parameters: `player`, `position`, `country`, `team`, `date`, `stats`, `sort`
   - Use: Season averages for players
   - Addon Required: STATS

4. **SEASONAL GAMES** - All games for a season
   - URL: `https://api.mysportsfeeds.com/v2.1/pull/nba/{season}/games.json`
   - Parameters: `team`, `date`, `status`, `sort`
   - Addon Required: CORE

**Season Format:** `{start_year}-{end_year}-{type}` (e.g., `2024-2025-regular`, `current`, `latest`)
**Date Format:** `YYYYMMDD` or keywords: `today`, `yesterday`, `tomorrow`

**Subscription Notes:**
- CORE tier includes: Schedule, games, roster data
- STATS tier includes: Player game logs, seasonal stats
- LIVE tier (NOT included): Real-time boxscore data during games - returns 403 error
- Current workaround: Use DAILY GAMES endpoint which provides game scores updated every 15 minutes

### NHL API Documentation

Full NHL API documentation is available in: `docs/mysportsfeeds-nhl-api.md`

**Key NHL Endpoints:**
- Daily Player Gamelogs: `/nhl/{season}/date/{date}/player_gamelogs.json`
- Daily Games: `/nhl/{season}/date/{date}/games.json`
- Seasonal Player Stats: `/nhl/{season}/player_stats_totals.json`
- Standings: `/nhl/{season}/standings.json`

**NHL Positions:** C (Center), LW (Left Wing), RW (Right Wing), D (Defense), G (Goalie)