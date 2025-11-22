# Sportfolio - Fantasy Sports Stock Market Platform

## Overview
Sportfolio is a fantasy sports trading platform that gamifies NBA player performance by allowing users to trade player shares like stocks. It combines real-time sports data with financial trading mechanics, featuring player share mining, 50/50 contests, and a professional-grade trading interface. The platform aims to provide an engaging experience for sports fans, blending fantasy sports with financial market dynamics, with a vision to expand to other sports.

## User Preferences
Preferred communication style: Simple, everyday language.

CRITICAL RULE: Never use mock, sample, or placeholder data under any circumstances. All data must come from live API sources (MySportsFeeds). If API data is unavailable, show empty states or loading indicators - never fabricate data.

## Performance Optimizations (Nov 2025)
The platform has been optimized to achieve sub-500ms response times for all major endpoints:

**Key Optimizations:**
1. **Session-based User Hydration**: Added `session.userHydrated` flag to prevent redundant user upserts on every request (saves 200-400ms per request)
2. **Batched Order Book Queries**: Created `getBatchOrderBooks()` method to fetch order books for all players in ONE query instead of N individual queries (50+ queries → 1 query)
3. **Batched Season Stats Queries**: Created `getBatchPlayerSeasonStatsFromLogs()` method to fetch season stats for all players in ONE query (50+ queries → 1 query)
4. **Batched Mining Queries**: Created `getBatchHoldings()` method to fetch holdings for multiple players in ONE query. Mining endpoints use `getPlayersByIds()` and `getBatchHoldings()` for validation and claiming, eliminating N+1 patterns in both multi-player and legacy single-player flows
5. **Database Indexing**: Btree indexes on player names, team, position, and price fields for optimized queries
6. **Parallel Batch Fetching**: Batch queries run in parallel using Promise.all for maximum efficiency
7. **Non-blocking Mining UI**: Mining dialog closes immediately with cache invalidation running in background for instant user feedback

**Performance Results:**
- `/api/players` endpoint: **89% faster** (3000ms → 340ms average)
- `/api/mining/start` and `/api/mining/claim` endpoints: **Optimized with batched queries** (no more N+1 patterns)
- Target achieved: **Sub-500ms response times** ✅
- All optimizations leverage server-side batching to eliminate N+1 query patterns

## System Architecture

### Frontend
The frontend uses React, TypeScript, Vite, Wouter for routing, and TanStack Query for server state management. Shadcn/ui (Radix UI, Tailwind CSS) provides components, following a custom design system inspired by Robinhood/Bloomberg with Inter typography. It features a sidebar navigation, real-time market ticker, card-based responsive layouts, a mining widget, and optimistic UI updates. Mobile experience is prioritized with bottom navigation.

A centralized cache invalidation utility (`client/src/lib/cache-invalidation.ts`) ensures instant synchronization of portfolio data across all pages.
A centralized WebSocket provider (`client/src/lib/websocket.tsx`) manages a single WebSocket connection for real-time updates across the application, with automatic reconnection and event broadcasting.

A notification system (`client/src/lib/notification-context.tsx`) tracks unread activity with badge notifications on the Portfolio tab. Notifications appear for background events (trade executions when limit orders match, contest settlements/payouts) but not for user-initiated actions (placing orders, mining claims, entering contests). The unread count is persisted in localStorage and clears when viewing the Activity tab.

### Backend
The backend is an Express.js server with TypeScript, supporting HTTP and WebSockets. It uses Drizzle ORM with a PostgreSQL database (Neon serverless) and Zod for validation. Core domain models include Users, Players, Holdings, Orders, Trades, Mining, Contests, and Price History. The system features atomic balance updates and precise timezone handling. API design is RESTful for data and uses WebSockets for live updates.

**Player ID System:** All players use **numeric IDs from MySportsFeeds API** (e.g., "9158" for LeBron James, "38840" for Paolo Banchero). This ensures consistency between API responses and database records, enabling seamless game log caching. The `roster_sync` job populates players with their MySportsFeeds numeric IDs automatically. Player IDs are permanent and do not change across seasons.

**Season Filtering System:** The `getCurrentSeason()` helper (in `mysportsfeeds.ts` and `sync-player-game-logs.ts`) provides intelligent season resolution based on the NBA calendar. It uses July handoff logic: Jan-Jun returns previous season (e.g., Feb 2025 → "2024-2025-regular"), Jul-Dec returns current season (e.g., Nov 2025 → "2025-2026-regular"). This ensures the correct competitive season is always used for roster queries and game log caching. The `getCurrentCompetitiveSeasons()` helper in `storage.ts` returns an array of season phases (regular + playoffs) for player stat queries, combining regular season and playoff performance into rolling averages while excluding preseason.

**Game Logs Caching:** Player game logs are fetched using MySportsFeeds **Daily Player Gamelogs endpoint** (NOT Seasonal) to optimize API rate limits. The date-based approach fetches ALL players' games for each date in a single request (~50 dates from Oct 1 to today = ~50 API calls total). Daily endpoint has 5-second backoff (6 points/request) vs Seasonal endpoint's 30-second backoff (31 points/request), making it 6x faster. Backfill completes in ~5-10 minutes instead of 4+ hours. Upsert operations handle duplicates efficiently, ensuring complete coverage even across multiple runs. All game logs are cached with pre-calculated fantasy points to eliminate API calls on player views.

### Database Schema
The database includes tables for `users`, `players`, `holdings`, `orders`, `trades`, `mining`, `mining_claims`, `contests`, `contest_entries`, `contest_lineups`, `player_game_stats`, `price_history`, `holdings_locks`, `balance_locks`, and `blog_posts`. Indexing is optimized for user-asset relationships, player filtering, and order book queries. Player shares are permanent across seasons.

**Blog System:** The `blog_posts` table stores admin-created content for SEO and user engagement. Each post includes title, slug (unique, URL-friendly), excerpt, full content, author reference, and publishedAt timestamp (null = draft). Blog posts support draft/published states and are managed through an admin-only interface. Public blog pages display only published posts with pagination support.

An activity tracking system aggregates mining claims, trades, and contest entries into a unified timeline with filtering and pagination.

Share and cash locking systems (`holdings_locks` and `balance_locks` tables) implement transactional locking mechanisms to prevent double-spending of shares and funds across orders, contests, and mining operations. These systems use atomic reservations with `SELECT...FOR UPDATE` and ensure automatic lock releases or adjustments.

Performance optimizations include SQL JOINs to prevent N+1 queries, marketplace pagination, batch player fetches, and React Query caching.

The `GET /api/players` endpoint supports comprehensive server-side search, filter, and sort operations for the player database, with optimized database indexes for performance. Contest entry pages dynamically filter players based on games scheduled for the contest date.

### Background Jobs
Background jobs, managed by `node-cron` in development and an external cron service in production, handle tasks like `roster_sync`, `schedule_sync`, `stats_sync`, `stats_sync_live`, `update_contest_statuses`, `settle_contests`, and `create_contests`.

The Contest Lifecycle & Settlement System automatically progresses contests through creation, status transition (open to live), and settlement stages. Settlement is contingent on both the contest `endsAt` time passing and all associated games being `completed` to ensure accurate prize distribution.

**Universal Live Logging System:** All admin operations feature real-time streaming logs via Server-Sent Events (SSE). The system provides granular visibility into job execution with structured log events (info/warning/error/progress/complete). Each job emits detailed progress callbacks showing records processed, API calls, errors, and debug information. The admin UI displays logs in a terminal-style LiveLogViewer component with auto-scroll, progress indicators, and status tracking. All 8 background jobs are fully instrumented: `syncPlayerGameLogs` (backfill), `settle_contests`, `roster_sync`, `schedule_sync`, `update_contest_statuses`, `create_contests`, `sync_stats`, and `sync_stats_live`. The streaming architecture uses unique operation IDs for concurrent job tracking and ensures all jobs emit completion events for proper UI state management.

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

## Content & SEO

**Blog System:** Admin-controlled blog at `/blog` provides original content for SEO and user engagement. Admins can create, edit, and delete blog posts via the admin panel (`/admin`). Blog posts support drafts (unpublished) and published states, with slug-based URLs (`/blog/[slug]`). Public blog pages show only published posts with pagination.

**Static Pages for AdSense Compliance:** Comprehensive legal and informational pages meet Google AdSense requirements:
- **Privacy Policy** (`/privacy`): Data collection, usage, retention, cookies, and user rights
- **Terms of Service** (`/terms`): User obligations, virtual currency rules, intellectual property, liability, and dispute resolution
- **About Us** (`/about`): Platform mission, features, and community information
- **Contact** (`/contact`): Support channels (Discord primary), response times, and contact information
- **How It Works** (`/how-it-works`): Detailed guides on trading, mining, contests, and platform features

**Footer Navigation:** Site footer (`client/src/components/footer.tsx`) provides easy access to all static pages, blog, and key platform sections. Footer appears on every page for consistent navigation.

## External Dependencies

-   **MySportsFeeds API:** Provides NBA player rosters, game schedules, and statistics (v2.1 CORE and STATS tiers).
-   **Neon Database:** Serverless PostgreSQL for data persistence.
-   **WebSocket Server:** Custom implementation for real-time updates.
-   **Plain Text Sports:** External link for live game statistics.
-   **Google Fonts CDN:** For typography.
-   **Google Analytics 4:** For tracking and analytics.
-   **Google AdSense:** For monetization (platform ready for application with comprehensive content and legal pages).
-   **Replit Auth:** Used for production-ready user authentication, supporting various OAuth providers and managing secure sessions with PostgreSQL-backed storage. New users receive a starting balance.