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
The database includes tables for `users`, `players`, `holdings`, `orders`, `trades`, `mining`, `mining_claims`, `contests`, `contest_entries`, `contest_lineups`, `player_game_stats`, `price_history`, `holdings_locks`, and `balance_locks`. Indexing is optimized for user-asset relationships, player filtering, and order book queries. Player shares are permanent across seasons.

An activity tracking system aggregates mining claims, trades, and contest entries into a unified timeline with filtering and pagination.

Share and cash locking systems (`holdings_locks` and `balance_locks` tables) implement transactional locking mechanisms to prevent double-spending of shares and funds across orders, contests, and mining operations. These systems use atomic reservations with `SELECT...FOR UPDATE` and ensure automatic lock releases or adjustments.

Performance optimizations include SQL JOINs to prevent N+1 queries, marketplace pagination, batch player fetches, and React Query caching.

The `GET /api/players` endpoint supports comprehensive server-side search, filter, and sort operations for the player database, with optimized database indexes for performance. Contest entry pages dynamically filter players based on games scheduled for the contest date.

### Background Jobs
Background jobs, managed by `node-cron` in development and an external cron service in production, handle tasks like `roster_sync`, `schedule_sync`, `stats_sync`, `stats_sync_live`, `update_contest_statuses`, `settle_contests`, and `create_contests`.

The Contest Lifecycle & Settlement System automatically progresses contests through creation, status transition (open to live), and settlement stages. Settlement is contingent on both the contest `endsAt` time passing and all associated games being `completed` to ensure accurate prize distribution.

## External Dependencies

-   **MySportsFeeds API:** Provides NBA player rosters, game schedules, and statistics (v2.1 CORE and STATS tiers).
-   **Neon Database:** Serverless PostgreSQL for data persistence.
-   **WebSocket Server:** Custom implementation for real-time updates.
-   **Plain Text Sports:** External link for live game statistics.
-   **Google Fonts CDN:** For typography.
-   **Google Analytics 4:** For tracking and analytics.
-   **Google AdSense:** For monetization.
-   **Replit Auth:** Used for production-ready user authentication, supporting various OAuth providers and managing secure sessions with PostgreSQL-backed storage. New users receive a starting balance.