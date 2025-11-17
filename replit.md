# Sportfolio - Fantasy Sports Stock Market Platform

## Overview
Sportfolio is a fantasy sports trading platform that gamifies NBA player performance by allowing users to trade player shares like stocks. It combines real-time sports data with financial trading mechanics, featuring player share mining, 50/50 contests, and a professional-grade trading interface inspired by platforms like Robinhood and Bloomberg Terminal. The platform aims to provide an engaging experience for sports fans, blending fantasy sports with financial market dynamics, with a vision to expand to other sports like NHL.

## User Preferences
Preferred communication style: Simple, everyday language.

**CRITICAL RULE: Never use mock, sample, or placeholder data under any circumstances.** All data must come from live API sources (MySportsFeeds). If API data is unavailable, show empty states or loading indicators - never fabricate data.

## Recent Changes (November 17, 2025)
- **Admin Panel with Role-Based Access:** Implemented comprehensive admin page (`/admin`) with system stats dashboard and manual job trigger controls, secured with dual authentication (token-based for Scheduled Deployments, session-based with `isAdmin` flag for logged-in admins)
- **Admin Security Model:** Added `isAdmin` boolean field to users table; admin button on profile page only visible to admin users; middleware properly validates both authentication paths with clear 401/503 error responses
- **Replit Scheduled Deployments:** Configured production to use Replit's native Scheduled Deployments feature for automated background jobs (no external services needed)
- **Production Documentation:** Created `PRODUCTION_SETUP.md` with complete Scheduled Deployments configuration instructions and admin security model
- **Help/Wiki Feature:** Added Help dialog accessible via question mark (?) button in header
- **Discord Integration:** Added Discord button in header linking to community server
- **Landing Page Redesign:** Mobile-optimized layout with smaller fonts, live badge, stats bar, and gradient CTA
- **Dark Mode Default:** Dark mode is now the default theme for new visitors
- **Portfolio Auth Guard:** Unauthenticated users receive helpful prompt to create account

## System Architecture

### Frontend Architecture
The frontend is built with React, TypeScript, Vite, Wouter for routing, and TanStack Query for server state management. It uses Shadcn/ui (Radix UI, Tailwind CSS) for components, following a custom design system inspired by Robinhood/Bloomberg with Inter typography for UI and JetBrains Mono for financial data. Key UI patterns include a sidebar navigation, real-time market ticker, card-based and responsive layouts for data views (adapting to mobile/desktop), a mining widget with enhanced player selection, and optimistic UI updates for instant feedback. The mobile experience is prioritized with bottom navigation and optimized layouts.

**Cache Invalidation System:**
A centralized cache invalidation utility (`client/src/lib/cache-invalidation.ts`) ensures instant synchronization of portfolio data across all pages. The `invalidatePortfolioQueries()` function uses React Query's array prefix matching to invalidate all portfolio-related queries including balance, holdings, orders, player prices, and contest data. All mutations (trading, mining, contest entry, cash operations) and WebSocket handlers invoke this centralized function to guarantee consistent data across Dashboard, Portfolio, Marketplace, Player pages, and the persistent header. This architecture eliminates stale data and provides real-time feedback without page refreshes.

**Real-Time Updates via WebSocket:**
A centralized WebSocket provider (`client/src/lib/websocket.tsx`) manages a single WebSocket connection shared across the entire application, ensuring zero stale data anywhere. The provider automatically reconnects on disconnect (3-second delay) and broadcasts events to all subscribed components. Every page subscribes to relevant WebSocket events:
- **Profile Page:** Listens for `portfolio`, `mining`, and `trade` events to update net worth, mining stats, and market order cards instantly
- **Marketplace:** Listens for `trade` and `orderBook` events to update player prices, volume, and 24h change in real-time
- **Portfolio:** Listens for `portfolio`, `trade`, and `orderBook` events to update balance, holdings, and pending orders live
- **Player Pages:** Listens for `trade`, `orderBook`, and `portfolio` events to update prices, trade history, and user balances instantly
- **Header Balance:** Listens for `portfolio` events to update cash balance display across all pages
- **Global Leaderboards:** Listens for `mining` (shares mined), `portfolio` (net worth), and `trade` (market orders) events to update all leaderboard rankings in real-time
- **Contest Leaderboards:** Listens for `contestUpdate` and `liveStats` events to update rankings as games progress

WebSocket event types: `portfolio` (balance/holdings changes), `mining` (mining activity), `trade` (trade executions), `orderBook` (order book changes), `liveStats` (game stat updates), `contestUpdate` (contest changes). The provider integrates with React Query's cache invalidation system to trigger automatic data refetches, ensuring every single data point updates instantly when backend data changes.

### Backend Architecture
The backend is an Express.js server with TypeScript, supporting both HTTP and WebSockets. It uses Drizzle ORM with a PostgreSQL database (Neon serverless) and Zod for validation. Core domain models include Users, Players, Holdings, Orders, Trades, Mining, Contests, and Price History. The system features atomic balance updates and precise timezone handling for NBA Eastern Time using `date-fns-tz` for accurate game scheduling and contest generation. API design is RESTful for data endpoints and uses WebSockets for live price and trade updates.

### Database Schema
The database schema includes key tables such as `users`, `players`, `holdings`, `orders`, `trades`, `mining`, `contests`, `contest_entries`, `contest_lineups`, `player_game_stats`, and `price_history`. Indexing is optimized for user-asset relationships, player filtering, and order book queries.

**CRITICAL: Player Share Persistence Across Seasons:**
Player shares are **permanent across all seasons** and never expire. Each player has a globally unique ID (from MySportsFeeds) that remains constant across seasons. When a user owns 100 shares of Stephen Curry in 2025, those exact same 100 shares persist into the 2026 season, 2027 season, and beyond. The `players` table uses MySportsFeeds numeric player IDs (e.g., "9218" for Stephen Curry) that are season-independent. Only game statistics (`player_game_stats` table) track seasonality via a `season` field - player identity and ownership never change. This ensures users build long-term portfolios that carry forward year after year.

## External Dependencies

**MySportsFeeds API Integration:**
- Utilizes MySportsFeeds NBA API (v2.1) for player rosters, game schedules, and statistics using the CORE and STATS tiers.
- Endpoints used: Daily Player Gamelogs, Daily Games, Seasonal Player Stats, Seasonal Games.
- Adheres to MySportsFeeds throttling requirements with a 5-second backoff between requests and a 100 requests/minute limit to manage API calls efficiently.
- All data is sourced live from MySportsFeeds (no mock data).
- The LIVE tier is not included, so in-progress game stats update every 15 minutes via the DAILY GAMES endpoint.

**Third-Party Services:**
- **Neon Database:** Serverless PostgreSQL for data persistence.
- **WebSocket Server:** Custom implementation for real-time updates and notifications.
- **Google Fonts CDN:** For delivering typography.

**Authentication:**
- **Replit Auth** integration for production-ready user authentication
- Supports login with Google, GitHub, email/password, and other OAuth providers
- Secure session management with PostgreSQL-backed session storage
- Automatic user creation/sync on first login via the `upsertUser` pattern
- New users receive $10,000 starting balance automatically

**Public Access:**
- **Contests & Leaderboards** are publicly viewable without authentication
- Anyone can browse contests, view entries, points, and potential earnings
- Contest entry details drawer shows each user's lineup, share counts, ownership percentages, fantasy points, and net winnings
- Authentication is only required to enter contests, trade shares, or mine players
- Public routes: `/api/contests`, `/api/contest/:id/leaderboard`, `/api/contest/:contestId/entries/:entryId`

**Background Jobs & Production Architecture:**

**Development Environment:**
- Background jobs run automatically via Node.js `node-cron` scheduler
- Jobs: `roster_sync` (daily 5am), `schedule_sync` (every minute), `stats_sync` (hourly), `stats_sync_live` (every minute), `settle_contests` (every 5 min), `create_contests` (daily midnight)

**Production Environment:**
- **Replit Scheduled Deployments:** Production uses Replit's native Scheduled Deployments feature to run background jobs at predetermined intervals
- **Admin API:** Secure endpoints at `/api/admin/jobs/trigger` and `/api/admin/stats` protected by `ADMIN_API_TOKEN` for scheduled deployments and manual triggers
- **Admin Panel:** Web UI at `/admin` (accessible from profile page) for manual job control and system monitoring
- **Setup Guide:** Complete Scheduled Deployments configuration instructions in `PRODUCTION_SETUP.md`

**Critical Jobs for Production (5 Scheduled Deployments):**
1. `create_contests` - Daily at midnight (creates contests for next 7 days)
2. `settle_contests` - Every 5 minutes (distributes winnings to contest winners)
3. `schedule_sync` - Every minute (updates live game scores)
4. `stats_sync` - Every hour (syncs completed game stats for contest scoring)
5. `roster_sync` - Daily at 5am (refreshes NBA player data)

**Advantages of Scheduled Deployments:**
- Native Replit integration (no external services needed)
- Built-in monitoring, logs, and error alerts
- Automatic environment variable/secret management
- Included in Replit Core credits
- Natural language scheduling support