# Sportfolio - Fantasy Sports Stock Market Platform

## Overview
Sportfolio is a fantasy sports trading platform that gamifies NBA player performance by allowing users to trade player shares like stocks. It combines real-time sports data with financial trading mechanics, featuring player share mining, 50/50 contests, and a professional-grade trading interface inspired by platforms like Robinhood and Bloomberg Terminal. The platform aims to provide an engaging experience for sports fans, blending fantasy sports with financial market dynamics, with a vision to expand to other sports like NHL.

## User Preferences
Preferred communication style: Simple, everyday language.

**CRITICAL RULE: Never use mock, sample, or placeholder data under any circumstances.** All data must come from live API sources (MySportsFeeds). If API data is unavailable, show empty states or loading indicators - never fabricate data.

## System Architecture

### Frontend Architecture
The frontend is built with React, TypeScript, Vite, Wouter for routing, and TanStack Query for server state management. It uses Shadcn/ui (Radix UI, Tailwind CSS) for components, following a custom design system inspired by Robinhood/Bloomberg with Inter typography for UI and JetBrains Mono for financial data. Key UI patterns include a sidebar navigation, real-time market ticker, card-based and responsive layouts for data views (adapting to mobile/desktop), a mining widget with enhanced player selection, and optimistic UI updates for instant feedback. The mobile experience is prioritized with bottom navigation and optimized layouts.

**Cache Invalidation System:**
A centralized cache invalidation utility (`client/src/lib/cache-invalidation.ts`) ensures instant synchronization of portfolio data across all pages. The `invalidatePortfolioQueries()` function uses React Query's array prefix matching to invalidate all portfolio-related queries including balance, holdings, orders, player prices, and contest data. All mutations (trading, mining, contest entry, cash operations) and WebSocket handlers invoke this centralized function to guarantee consistent data across Dashboard, Portfolio, Marketplace, Player pages, and the persistent header. This architecture eliminates stale data and provides real-time feedback without page refreshes.

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
- All API routes protected with `isAuthenticated` middleware
- New users receive $10,000 starting balance automatically

**Background Jobs (Cron):**
- Automated daily `roster_sync`, minute-by-minute `schedule_sync` (for live game scores), hourly `stats_sync` (for completed games), and `settle_contests` every 5 minutes.