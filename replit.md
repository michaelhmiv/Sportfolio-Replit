# Sportfolio - Fantasy Sports Stock Market Platform

## Overview
Sportfolio is a fantasy sports trading platform that gamifies NBA player performance by allowing users to trade player shares like stocks. It combines real-time sports data with financial trading mechanics, featuring player share mining, 50/50 contests, and a professional-grade trading interface. The platform aims to provide an engaging experience for sports fans, blending fantasy sports with financial market dynamics, with a vision to expand to other sports and achieve sub-500ms response times for all major endpoints.

## User Preferences
Preferred communication style: Simple, everyday language.

CRITICAL RULE: Never use mock, sample, or placeholder data under any circumstances. All data must come from live API sources (MySportsFeeds). If API data is unavailable, show empty states or loading indicators - never fabricate data.

## System Architecture

### Frontend
The frontend uses React, TypeScript, Vite, Wouter for routing, and TanStack Query for server state management. Shadcn/ui (Radix UI, Tailwind CSS) provides components, following a custom design system inspired by Robinhood/Bloomberg with Inter typography. It features a sidebar navigation, real-time market ticker, card-based responsive layouts, a mining widget, and optimistic UI updates. Mobile experience is prioritized with bottom navigation.

Authentication uses the `useAuth()` hook to handle unauthenticated sessions gracefully, allowing public access to dashboards and market data. A centralized cache invalidation utility and WebSocket provider manage real-time updates. A notification system tracks unread activity for background events like trade executions and contest settlements.

### Backend
The backend is an Express.js server with TypeScript, supporting HTTP and WebSockets. It uses Drizzle ORM with a PostgreSQL database (Neon serverless) and Zod for validation. Core domain models include Users, Players, Holdings, Orders, Trades, Mining, Contests, and Price History. The system features atomic balance updates and precise timezone handling. API design is RESTful for data and uses WebSockets for live updates.

Player IDs are numeric from MySportsFeeds API, ensuring consistency. A season filtering system provides intelligent season resolution based on the NBA calendar. Game logs are cached efficiently using the MySportsFeeds Daily Player Gamelogs endpoint.

The database schema includes tables for `users`, `players`, `holdings`, `orders`, `trades`, `mining`, `mining_claims`, `contests`, `contest_entries`, `contest_lineups`, `player_game_stats`, `price_history`, `holdings_locks`, `balance_locks`, and `blog_posts`. Indexing is optimized for user-asset relationships, player filtering, and order book queries. Share and cash locking systems prevent double-spending. The `/api/players` endpoint supports comprehensive server-side search, filter, and sort.

#### Timezone Handling (Updated: 2025-11-23)
**CRITICAL: All game scheduling must be based on Eastern Time (ET), not UTC or local timezone.**

The platform uses a centralized time utility library (`server/lib/time.ts`) to ensure all game-related queries and displays are based on the game's start time in Eastern Time:

- **Single Source of Truth**: All queries use `start_time` field (stored as UTC in database) and convert to ET for determining which "day" a game belongs to
- **getGameDay()**: Converts any UTC timestamp to a YYYY-MM-DD string in Eastern Time
- **getETDayBoundaries()**: Converts a YYYY-MM-DD string to UTC Date boundaries (midnight ET to 11:59pm ET)
- **Backend returns `gameDay`**: All game API endpoints include a normalized `gameDay` field so frontend doesn't need timezone logic
- **Database queries**: `getDailyGames()` and related methods query by `start_time` using ET boundaries, NOT by the `date` field

This ensures that:
- A game at 7pm ET on Nov 22 (midnight UTC on Nov 23) appears on Nov 22 calendar
- A game at 1pm ET on Nov 22 (6pm UTC on Nov 22) appears on Nov 22 calendar
- Contest settlement finds games by their start_time in ET boundaries
- Dashboard and calendar displays are consistent across timezones

### Background Jobs
Background jobs, managed by `node-cron`, handle tasks like `roster_sync`, `schedule_sync`, `stats_sync`, `stats_sync_live`, `update_contest_statuses`, `settle_contests`, and `create_contests`. A Contest Lifecycle & Settlement System automatically progresses contests. A Universal Live Logging System provides real-time streaming logs via Server-Sent Events (SSE) for all admin operations, offering granular visibility into job execution.

### Design Principles
The UI prioritizes information density and compact layouts inspired by professional financial trading platforms, minimizing spacing and using smaller typography for data displays. Interactive elements include clickable player names and usernames that open modals or navigate to profiles. A Player Information System provides a compact `PlayerModal` and a dedicated `Player Page` for trading with charts, order books, and contest metrics. Public marketplace access is available without authentication.

### Data Analytics & Original Content (Updated: 2025-11-26)
The platform provides comprehensive data analysis features to meet AdSense requirements for original content:

**Analytics Page (`/analytics`):**

*Market Health Dashboard:*
- Three metric cards showing Transactions, Volume, and Market Cap with percentage changes vs previous period
- Timeframe selector: 24H, 7D, 30D, 3M, 1Y, All Time
- Time series chart showing market activity over time (volume trend)
- All metrics calculated from real trades and holdings tables

*Tabs:*
- Overview tab: Power Rankings top 10 with composite scores, Volume by Position bar chart
- Hot/Cold Players: Biggest gainers (positive price change) and losers (negative price change)
- Rankings: Full power rankings table with Price, Volume, Avg Fantasy Points, Score, 7d Change
- Heatmap: Team/position matrix showing average price changes and top players per cell
- Compare: Enhanced multi-player comparison (up to 5 players) with:
  - Shares Outstanding (from holdings table)
  - Market Cap (shares × price)
  - Price, Volume, 24h Change
  - Contest Usage % (from contest_lineups table)
  - Overlaid price history chart
- Positions: Position-based player rankings (PG, SG, SF, PF, C) with fantasy points averages

*Power Rankings Scoring (40/30/30 weights):*
- 40% Price Momentum: -20% to +20% mapped to 0-100
- 30% Volume: 0-100+ shares mapped to 0-100
- 30% Fantasy Points: Average from player_game_stats (0-50 FP mapped to 0-100)

**Leaderboards (`/leaderboards`):**
- Net Worth rankings
- Portfolio Value rankings
- Cash Balance rankings
- Shares Mined rankings
- Market Orders rankings
- Real-time WebSocket updates

**Weekly Roundup Generator:**
- Automated job runs every Monday at 6 AM ET (`weekly_roundup`)
- Generates blog posts with: market overview, top gainers/losers, most traded players, contest highlights
- Creates SEO-optimized content with markdown formatting and tables
- Stored in blog system for admin review and publishing

**Analytics API Endpoints:**
- `/api/analytics?timeRange=<24H|7D|30D|3M|1Y|All>` - Market health, hot/cold players, power rankings, heatmap, positions
- `/api/analytics/compare?playerIds=<comma-separated>&timeRange=<timeRange>` - Enhanced player comparison with shares, market cap, contest usage
- `/api/analytics/correlations?timeRange=<timeRange>` - Price correlation analysis

**Storage Methods (in server/storage.ts):**
- `getMarketHealthStats(startDate, endDate)` - Transaction count, volume, market cap with period comparison
- `getMarketHealthTimeSeries(startDate, endDate)` - Daily aggregates for charts
- `getPlayerSharesOutstanding(playerIds?)` - Total shares held per player from holdings
- `getContestUsageStats(playerIds?)` - Times used in contests, usage percentage
- `getPriceHistoryRange(playerIds, startDate, endDate)` - Historical prices for comparison charts
- `getHotColdPlayers(limit)` - Players with biggest positive/negative price changes
- `getHeatmapData()` - Aggregated by team and position
- `getPowerRankings(limit)` - Composite score calculations with fantasy stats

### Content & SEO
A blog system (`/blog`) provides admin-controlled content for SEO and user engagement, supporting draft and published states. Static pages for legal information (`/privacy`, `/terms`), platform information (`/about`, `/contact`, `/how-it-works`) ensure AdSense compliance and comprehensive user guidance. A site footer provides consistent navigation.

#### SEO Implementation (Updated: 2025-11-23)
**CRITICAL: Always keep SEO implementations updated when making significant changes to the platform.**

The platform implements comprehensive SEO optimizations for both traditional search engines (Google, Bing) and AI-powered search (ChatGPT, Perplexity, Claude):

**Core SEO Files:**
- `client/public/robots.txt` - Guides search engine crawlers, allows all public pages, disallows admin/auth/api routes
- `/sitemap.xml` (dynamic endpoint in `server/routes.ts`) - Auto-generates sitemap including:
  - All static pages (homepage, marketplace, contests, blog, legal pages)
  - Top 200 player pages by trading volume
  - All contest leaderboard pages
  - All published blog posts
  - **MAINTENANCE:** Sitemap automatically updates when new players, contests, or blog posts are added

**JSON-LD Structured Data:**
- Global schemas added to `App.tsx`: Organization, WebSite, WebApplication
- Article schema on blog post pages (`blog-post.tsx`)
- Person schema on player pages (`player.tsx`)
- FAQPage schema on How It Works page (`how-it-works.tsx`)
- Schema component: `client/src/components/schema-org.tsx`
- **MAINTENANCE:** When adding new page types (e.g., team pages, contest detail pages), add appropriate schema markup using the `SchemaOrg` component

**Dynamic Meta Tags:**
- Blog posts: Unique title, description, Open Graph, Twitter Cards (auto-generated from post data)
- Player pages: Dynamic title/description including player name, team, position, current price
- **MAINTENANCE:** When adding new dynamic pages, implement SEO meta tags using useEffect pattern (see blog-post.tsx and player.tsx examples)

**SEO Best Practices:**
- All images should have descriptive alt text
- Proper heading hierarchy (H1 → H2 → H3)
- Semantic HTML (`<article>`, `<section>`, `<nav>`)
- Mobile-responsive design
- Fast page load times
- Internal linking between related pages

**Future SEO Enhancements to Consider:**
- Breadcrumb navigation with schema markup
- Image sitemap for player photos
- Video schema if adding video content
- Review/Rating schema for contests
- LocalBusiness schema if expanding to physical locations
- Additional FAQ pages for common queries

## External Dependencies

-   **MySportsFeeds API:** Provides NBA player rosters, game schedules, and statistics.
-   **Neon Database:** Serverless PostgreSQL for data persistence.
-   **WebSocket Server:** Custom implementation for real-time updates.
-   **Plain Text Sports:** External link for live game statistics.
-   **Google Fonts CDN:** For typography.
-   **Google Analytics 4:** For tracking and analytics.
-   **Google AdSense:** For monetization.
-   **Replit Auth:** For user authentication and secure sessions, with new users receiving a starting balance.