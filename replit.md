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

**Performance Optimizations:**
- Portfolio endpoint uses SQL JOIN query (`getUserHoldingsWithPlayers`) to fetch holdings + players + locks in a single database round-trip, eliminating N+1 query issues
- Marketplace implements pagination (50 items per page) with limit/offset for fast page loads
- Dashboard uses batch player fetches via `getPlayersByIds()` to minimize database queries
- React Query configured with 10-second staleTime for balanced cache freshness and performance

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
- **Google Fonts CDN:** For delivering typography.
- **Google Analytics 4:** Tracking and analytics (Measurement ID: G-Q2SC72MKTF).
- **Google AdSense:** Monetization via display ads (Publisher ID: ca-pub-3663304837019777).

**Authentication:**
- **Replit Auth** integration for production-ready user authentication.
- Supports login with Google, GitHub, email/password, and other OAuth providers.
- Secure session management with PostgreSQL-backed session storage.
- Automatic user creation/sync on first login via the `upsertUser` pattern.
- New users receive $10,000 starting balance automatically.

**Public Access:**
- Contests and Leaderboards are publicly viewable without authentication.
- Authentication is only required to enter contests, trade shares, or mine players.
- Public routes: `/api/contests`, `/api/contest/:id/leaderboard`, `/api/contest/:contestId/entries/:entryId`.