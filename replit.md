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

### Background Jobs
Background jobs, managed by `node-cron`, handle tasks like `roster_sync`, `schedule_sync`, `stats_sync`, `stats_sync_live`, `update_contest_statuses`, `settle_contests`, and `create_contests`. A Contest Lifecycle & Settlement System automatically progresses contests. A Universal Live Logging System provides real-time streaming logs via Server-Sent Events (SSE) for all admin operations, offering granular visibility into job execution.

### Design Principles
The UI prioritizes information density and compact layouts inspired by professional financial trading platforms, minimizing spacing and using smaller typography for data displays. Interactive elements include clickable player names and usernames that open modals or navigate to profiles. A Player Information System provides a compact `PlayerModal` and a dedicated `Player Page` for trading with charts, order books, and contest metrics. Public marketplace access is available without authentication.

### Content & SEO
A blog system (`/blog`) provides admin-controlled content for SEO and user engagement, supporting draft and published states. Static pages for legal information (`/privacy`, `/terms`), platform information (`/about`, `/contact`, `/how-it-works`) ensure AdSense compliance and comprehensive user guidance. A site footer provides consistent navigation.

## External Dependencies

-   **MySportsFeeds API:** Provides NBA player rosters, game schedules, and statistics.
-   **Neon Database:** Serverless PostgreSQL for data persistence.
-   **WebSocket Server:** Custom implementation for real-time updates.
-   **Plain Text Sports:** External link for live game statistics.
-   **Google Fonts CDN:** For typography.
-   **Google Analytics 4:** For tracking and analytics.
-   **Google AdSense:** For monetization.
-   **Replit Auth:** For user authentication and secure sessions, with new users receiving a starting balance.