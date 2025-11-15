# Sportfolio - Fantasy Sports Stock Market Platform

## Overview

Sportfolio is a fantasy sports trading platform that gamifies NBA player performance. It allows users to trade player shares like stocks, combining real-time sports data with financial trading mechanics. Key features include player share mining, 50/50 contests, and a professional-grade trading interface inspired by platforms like Robinhood and Bloomberg Terminal. The project aims to create an engaging experience for sports fans, offering a unique blend of fantasy sports and financial market dynamics.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- NBA player roster and game stats synchronization (`/player_gamelogs.json`, `/seasonal_player_stats.json`).
- Real-time game statistics for scoring.
- Player stats endpoints: `/api/player/:id/stats` (season averages) and `/api/player/:id/recent-games` (last 5 games).
- All data directly from MySportsFeeds Core + Stats subscription (no mock data).

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
- `schedule_sync`: Every 6 hours.
- `stats_sync`: Hourly (completed games).
- `stats_sync_live`: Every minute (in-progress games).
- `settle_contests`: Every 5 minutes (settles contests, distributes prizes).

**Contest Scoring Mechanics:**
- **Proportional Share-Dilution Model:** Fantasy points distributed based on ownership percentage within a contest.
- **50/50 Contests:** Top 50% entries win, prize pool distributed proportionally.