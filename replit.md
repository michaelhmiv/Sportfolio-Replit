# Sportfolio - Fantasy Sports Stock Market Platform

## Overview
Sportfolio is a fantasy sports trading platform that gamifies NBA player performance by allowing users to trade player shares like stocks. It combines real-time sports data with financial trading mechanics, featuring player share mining, 50/50 contests, and a professional-grade trading interface. The platform aims to provide an engaging experience for sports fans, blending fantasy sports with financial market dynamics, with a vision to expand to other sports.

## User Preferences
Preferred communication style: Simple, everyday language.

CRITICAL RULE: Never use mock, sample, or placeholder data under any circumstances. All data must come from live API sources (MySportsFeeds). If API data is unavailable, show empty states or loading indicators - never fabricate data.

## System Architecture

### Frontend
The frontend uses React, TypeScript, Vite, Wouter for routing, and TanStack Query for server state management. Shadcn/ui (Radix UI, Tailwind CSS) provides components, following a custom design system inspired by Robinhood/Bloomberg with Inter typography. It features a sidebar navigation, real-time market ticker, card-based responsive layouts, a mining widget, and optimistic UI updates. Mobile experience is prioritized with bottom navigation.

A centralized cache invalidation utility (`client/src/lib/cache-invalidation.ts`) ensures instant synchronization of portfolio data across all pages.
A centralized WebSocket provider (`client/src/lib/websocket.tsx`) manages a single WebSocket connection for real-time updates across the application, with automatic reconnection and event broadcasting.

A notification system (`client/src/lib/notification-context.tsx`) tracks unread activity with badge notifications on the Portfolio tab. Notifications appear for background events (trade executions when limit orders match, contest settlements/payouts) but not for user-initiated actions (placing orders, mining claims, entering contests). The unread count is persisted in localStorage and clears when viewing the Activity tab.

### Backend
The backend is an Express.js server with TypeScript, supporting HTTP and WebSockets. It uses Drizzle ORM with a PostgreSQL database (Neon serverless) and Zod for validation. Core domain models include Users, Players, Holdings, Orders, Trades, Mining, Contests, and Price History. The system features atomic balance updates and precise timezone handling. API design is RESTful for data and uses WebSockets for live updates.

### Database Schema
The database includes tables for `users`, `players`, `holdings`, `orders`, `trades`, `mining`, `mining_claims`, `contests`, `contest_entries`, `contest_lineups`, `player_game_stats`, `player_season_summaries`, `price_history`, `holdings_locks`, and `balance_locks`. Indexing is optimized for user-asset relationships, player filtering, and order book queries. Player shares are permanent across seasons.

An activity tracking system aggregates mining claims, trades, and contest entries into a unified timeline with filtering and pagination.

Share and cash locking systems (`holdings_locks` and `balance_locks` tables) implement transactional locking mechanisms to prevent double-spending of shares and funds across orders, contests, and mining operations. These systems use atomic reservations with `SELECT...FOR UPDATE` and ensure automatic lock releases or adjustments.

### Performance & Caching Architecture
A persistent stats caching layer dramatically reduces MySportsFeeds API calls by ~95%, ensuring scalability and instant page loads:

**Caching Tables:**
- `player_season_summaries`: Stores season averages (PPG, RPG, APG, etc.), shooting percentages, and pre-calculated fantasy points per game. **Auto-recalculated via SQL aggregation** from `player_game_stats` after each stats sync (hourly + real-time during live games). Aggregation groups by `(playerId, season)` to support multi-season data.
- `player_game_stats`: Stores individual game statistics, updated hourly and in real-time during live games. Season is derived from game date using `deriveSeasonFromDate()` utility.

**Database Aggregation Approach:**
- Season summaries are calculated by aggregating `player_game_stats` locally using SQL reduce operations, eliminating MySportsFeeds API dependency for season stats.
- Recalculation is automatic: `stats_sync` (hourly) and `stats_sync_live` (every minute during games) trigger `recalculatePlayerSeasonSummary()` for affected players.
- MySportsFeeds throttling (30-second backoff for Seasonal Player Gamelogs) made API-based sync impractical (3.9 hours for all players). Database aggregation is instant and scalable.

**API Optimization:**
- `GET /api/players`: Reads FPG from `player_season_summaries` instead of calling MySportsFeeds API for each player (reduces ~500 API calls per marketplace page load to 0).
- `GET /api/player/:id/stats`: Reads season averages from `player_season_summaries` instead of live API calls.
- `GET /api/player/:id/recent-games`: Reads from `player_game_stats` instead of calling MySportsFeeds game logs API.

**Season Management:**
The system uses MySportsFeeds API's built-in season handling via the "latest" keyword, which automatically resolves to the current active season (regular or playoff). The `CURRENT_SEASON` constant ("2024-2025-regular") is used as a stable identifier for data storage and aggregation. MySportsFeeds handles the complexity of season transitions, playoff detection, and multi-season data through their API endpoints.

Performance optimizations include SQL JOINs to prevent N+1 queries, marketplace pagination, batch player fetches, React Query caching, and persistent database-backed stats caching with automatic aggregation.

The `GET /api/players` endpoint supports comprehensive server-side search, filter, and sort operations for the player database, with optimized database indexes for performance. Contest entry pages dynamically filter players based on games scheduled for the contest date.

### Background Jobs
Background jobs, managed by `node-cron` in development and an external cron service in production, handle data synchronization and contest management:

**Data Sync Jobs:**
- `roster_sync` (daily 5am ET): Updates player rosters, team assignments, and mining eligibility
- `schedule_sync` (every minute): Fetches daily game schedules and live scores
- `stats_sync` (hourly): Syncs completed game statistics to `player_game_stats`, then auto-recalculates season summaries for affected players
- `stats_sync_live` (every minute): Real-time stats updates during live games, then auto-recalculates season summaries for affected players

**Contest Jobs:**
- `create_contests` (daily midnight): Creates 50/50 contests for upcoming games
- `update_contest_statuses` (every minute): Transitions contests from open to live
- `settle_contests` (every 5 minutes): Distributes prizes when contests complete

The Contest Lifecycle & Settlement System automatically progresses contests through creation, status transition (open to live), and settlement stages. Settlement is contingent on both the contest `endsAt` time passing and all associated games being `completed` to ensure accurate prize distribution.

## Design Principles

### Compact & Information-Dense UI
Sportfolio prioritizes information density and compact layouts inspired by professional financial trading platforms. The design philosophy emphasizes showing maximum relevant information without wasted space:

-   **Typography:** Use marketplace-style font sizes (text-sm, text-xs) for lists and data displays. Larger text is reserved for headlines and primary metrics only.
-   **Spacing:** Minimize padding and gaps between elements. Use tight spacing (gap-1.5, gap-2, pb-1, pb-2) instead of spacious layouts common in "general AI" designs.
-   **Card Design:** Keep cards compact with reduced padding. Card headers should use smaller titles (text-sm) and minimal bottom padding (pb-1, pb-2).
-   **List Items:** Design list items to be concise, showing multiple entries in a viewport without scrolling. Prioritize horizontal space usage.
-   **Modals & Dialogs:** Maximize information visible at once. Show only essential items (e.g., 5 recent games) with "see more" links to full pages rather than long scrollable lists.
-   **Data Visualization:** Present stats in compact grids with small labels and tight spacing. Use abbreviated labels (PPG, RPG, APG) where appropriate.

The goal is a professional, data-rich interface where users can quickly scan and process information, similar to Bloomberg Terminal or professional trading platforms. Avoid spacious, magazine-style layouts that waste screen real estate.

### Interactive Elements
-   **Clickable Names:** All player names and usernames throughout the application are clickable, opening player modals or navigating to user profiles respectively.
-   **PlayerName Component:** A reusable component that makes player names clickable, opening a detailed player modal with stats, recent games, and market information.
-   **UserName Component:** A reusable component that makes usernames clickable, navigating to user profile pages.

### Player Information System
-   **PlayerModal:** Compact single-view modal displaying market information, season stats, and recent games without tabs. Uses marketplace-style typography (text-xs, text-[10px]) and tight spacing (gap-1, gap-2, p-2). Recent games show most recent first with expandable "see more" functionality (loads 5 games at a time).
-   **Player Page:** Standalone trading page with price chart, order book, recent trades, and contest performance metrics. Contest performance (appearances, total earnings, win rate) always displays with fallback to zero values when data unavailable.
-   **Public Marketplace Access:** Marketplace page accessible without authentication, allowing visitors to browse player listings before signing up.

## External Dependencies

-   **MySportsFeeds API:** Provides NBA player rosters, game schedules, and statistics (v2.1 CORE and STATS tiers).
-   **Neon Database:** Serverless PostgreSQL for data persistence.
-   **WebSocket Server:** Custom implementation for real-time updates.
-   **Plain Text Sports:** External link for live game statistics.
-   **Google Fonts CDN:** For typography.
-   **Google Analytics 4:** For tracking and analytics.
-   **Google AdSense:** For monetization.
-   **Replit Auth:** Used for production-ready user authentication, supporting various OAuth providers and managing secure sessions with PostgreSQL-backed storage. New users receive a starting balance.