# Sportfolio - Fantasy Sports Stock Market Platform

## Overview
Sportfolio is a fantasy sports trading platform that gamifies NBA player performance by allowing users to trade player shares like stocks. It combines real-time sports data with financial trading mechanics, featuring player share mining, 50/50 contests, and a professional-grade trading interface. The platform aims to provide an engaging experience for sports fans, blending fantasy sports with financial market dynamics, with a vision to expand to other sports.

## User Preferences
Preferred communication style: Simple, everyday language.

**CRITICAL RULE: Never use mock, sample, or placeholder data under any circumstances.** All data must come from live API sources (MySportsFeeds). If API data is unavailable, show empty states or loading indicators - never fabricate data.

## System Architecture

### Frontend Architecture
The frontend is built with React, TypeScript, Vite, Wouter for routing, and TanStack Query for server state management. It uses Shadcn/ui (Radix UI, Tailwind CSS) for components, following a custom design system inspired by Robinhood/Bloomberg with Inter typography for UI and JetBrains Mono for financial data. Key UI patterns include a sidebar navigation, real-time market ticker, card-based and responsive layouts, a mining widget with enhanced player selection, and optimistic UI updates for instant feedback. The mobile experience is prioritized with bottom navigation and optimized layouts.

**Cache Invalidation System:**
A centralized cache invalidation utility (`client/src/lib/cache-invalidation.ts`) ensures instant synchronization of portfolio data across all pages. The `invalidatePortfolioQueries()` function uses React Query's array prefix matching to invalidate all portfolio-related queries. All mutations (trading, mining, contest entry, cash operations) and WebSocket handlers invoke this function to guarantee consistent data across the application.

**Real-Time Updates via WebSocket:**
A centralized WebSocket provider (`client/src/lib/websocket.tsx`) manages a single WebSocket connection shared across the entire application, ensuring zero stale data. The provider automatically reconnects on disconnect and broadcasts events to all subscribed components, including profile, marketplace, portfolio, player pages, header balance, and leaderboards. WebSocket event types include `portfolio`, `mining`, `trade`, `orderBook`, `liveStats`, and `contestUpdate`.

### Backend Architecture
The backend is an Express.js server with TypeScript, supporting both HTTP and WebSockets. It uses Drizzle ORM with a PostgreSQL database (Neon serverless) and Zod for validation. Core domain models include Users, Players, Holdings, Orders, Trades, Mining, Contests, and Price History. The system features atomic balance updates and precise timezone handling for NBA Eastern Time using `date-fns-tz`. API design is RESTful for data endpoints and uses WebSockets for live price and trade updates.

### Database Schema
The database schema includes key tables such as `users`, `players`, `holdings`, `orders`, `trades`, `mining`, `contests`, `contest_entries`, `contest_lineups`, `player_game_stats`, `price_history`, and `holdings_locks`. Indexing is optimized for user-asset relationships, player filtering, and order book queries. Player shares are permanent across all seasons, identified by a globally unique MySportsFeeds numeric player ID.

**Share Locking System (Double-Spend Prevention):**
The `holdings_locks` table implements a transactional locking mechanism to prevent users from double-spending their shares across multiple orders, contests, or mining operations. Key features:
- Lock types: "order" (sell orders), "contest" (contest entries), "mining" (mining operations)
- Available shares formula: `holdings.quantity - SUM(holdings_locks.lockedQuantity)`
- Atomic reservations using database transactions with SELECT...FOR UPDATE to prevent race conditions
- Automatic lock releases on order cancellation, partial/full order fills, and contest settlement
- All lock operations are transactional to guarantee data consistency under high concurrency

**Cash Locking System (Double-Spend Prevention):**
The `balance_locks` table implements a parallel locking mechanism to prevent users from placing buy orders that exceed their available balance. Key features:
- Lock types: "order" (buy orders reserve cash until filled/cancelled)
- Available balance formula: `user.balance - SUM(balance_locks.lockedAmount)`
- Atomic cash reservations using database transactions to prevent race conditions
- Automatic lock adjustments on partial buy order fills (releases proportional to filled quantity)
- Automatic lock releases on buy order cancellation or full fills
- Buy order validation checks available balance before order creation
- All cash lock operations are transactional to guarantee data consistency under high concurrency

**Performance Optimizations:**
- Portfolio endpoint uses SQL JOIN query (`getUserHoldingsWithPlayers`) to fetch holdings + players + locks in a single database round-trip, eliminating N+1 query issues
- Marketplace implements pagination (50 items per page) with limit/offset for fast page loads
- Dashboard uses batch player fetches via `getPlayersByIds()` to minimize database queries
- React Query configured with 10-second staleTime for balanced cache freshness and performance

**Server-Side Search, Filter, and Sort (Marketplace & Mining):**
The `GET /api/players` endpoint supports comprehensive server-side operations to enable searching across the entire player database (500-5000+ players) rather than limiting to client-side loaded data only:

Query Parameters:
- `search` (string): Case-insensitive search on firstName and lastName (debounced 250ms on frontend)
- `team` (string): Filter by exact team name
- `position` (string): Filter by position (G, F, C, etc.)
- `sortBy` (string): Sort field - 'price', 'volume', 'change', 'bid', 'ask' (default: 'volume')
- `sortOrder` (string): Sort direction - 'asc' or 'desc' (default: 'desc')
- `hasBuyOrders` (boolean): Only show players with active buy orders (includes both 'open' and 'partial' statuses)
- `hasSellOrders` (boolean): Only show players with active sell orders (includes both 'open' and 'partial' statuses)
- `limit` (number): Results per page (default: 50, max: 200)
- `offset` (number): Pagination offset

Database indexes on firstName, lastName, team, position, lastTradePrice, volume24h, and priceChange24h ensure sub-150ms query performance. NULL handling uses `NULLS LAST` for both ASC and DESC sorts on price/bid/ask fields, ensuring players with real market data always appear before those without trades or order books.

### Background Jobs
**Development Environment:** Background jobs run automatically via Node.js `node-cron` scheduler for tasks like `roster_sync`, `schedule_sync`, `stats_sync`, `stats_sync_live`, `settle_contests`, and `create_contests`.

**Production Environment:** Production uses an external cron service (cron-job.org) to trigger jobs via secure admin API endpoints at `/api/admin/jobs/trigger` and `/api/admin/stats`, protected by `ADMIN_API_TOKEN`. A web UI at `/admin` (accessible from the profile page) allows for manual job control and system monitoring.

## External Dependencies

**MySportsFeeds API Integration:**
- Utilizes MySportsFeeds NBA API (v2.1) for player rosters, game schedules, and statistics (CORE and STATS tiers).
- Endpoints used: Daily Player Gamelogs, Daily Games, Seasonal Player Stats, Seasonal Games.
- Adheres to MySportsFeeds throttling requirements. All data is sourced live.

**Third-Party Services:**
- **Neon Database:** Serverless PostgreSQL for data persistence.
- **WebSocket Server:** Custom implementation for real-time updates and notifications.
- **Plain Text Sports:** External live game stats provider linked from game details modal (plaintextsports.com).
- **Google Fonts CDN:** For delivering typography.
- **Google Analytics 4:** Tracking and analytics (Measurement ID: G-Q2SC72MKTF).
- **Google AdSense:** Monetization via display ads (Publisher ID: ca-pub-3663304837019777).

**Game Details Modal & Live Stats:**
- Dashboard displays Recent Games widget with clickable game cards
- GameDetailsModal shows game information (teams, scores, status, date/time)
- Links to Plain Text Sports for live stats, play-by-play, and box scores
- URL conversion: MySportsFeeds format `YYYYMMDD-AWAY-HOME` → Plain Text Sports format `https://plaintextsports.com/nba/YYYY-MM-DD/away-home`
- Comprehensive input validation in `getPlainTextSportsUrl()` prevents crashes from malformed game IDs
- Validation includes: type checking, part count, date format (8 digits), team codes (2-4 uppercase letters), trimming whitespace
- Invalid game IDs return safe fallback href `'#'` with error logging instead of crashing

**Authentication:**
- **Replit Auth** integration for production-ready user authentication.
- Supports login with Google, GitHub, email/password, and other OAuth providers.
- Secure session management with PostgreSQL-backed session storage (7-day TTL, secure cookies with sameSite: lax).
- Automatic user creation/sync on first login via the `upsertUser` pattern.
- New users receive $10,000 starting balance automatically.

**OAuth Debugging & Error Handling:**
- Comprehensive production-safe debug logging (`AUTH_DEBUG=true` or auto-enabled in dev) with categorized prefixes: `[AUTH:LOGIN]`, `[AUTH:CALLBACK]`, `[AUTH:VERIFY]`, `[AUTH:USER_UPSERT]`, etc.
- Redirect URI debugging: logs exact callback URLs, protocols, hostnames at both login and callback stages to diagnose domain mismatch issues (.replit.app vs .replit.dev).
- Session and cookie tracking throughout OAuth flow to diagnose session persistence issues.
- User-friendly error page (`/auth/error`) with actionable messages for common OAuth failures (access_denied, server_error, callback_failed).
- All sensitive data (OAuth codes, state params, tokens) automatically redacted; user IDs truncated to first 8 chars.
- Complete troubleshooting guide available in `AUTH_DEBUG.md`.

**Public Access:**
- Contests and Leaderboards are publicly viewable without authentication.
- Authentication is only required to enter contests, trade shares, or mine players.
- Public routes: `/api/contests`, `/api/contest/:id/leaderboard`, `/api/contest/:contestId/entries/:entryId`.