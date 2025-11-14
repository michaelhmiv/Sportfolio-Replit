# Sportfolio - Fantasy Sports Stock Market Platform

## Overview

Sportfolio is a fantasy sports trading platform that gamifies NBA player performance by allowing users to trade player shares like stocks. The platform combines real-time sports data with financial trading mechanics, featuring player share mining, 50/50 contests, and a professional-grade trading interface inspired by Robinhood and Bloomberg Terminal.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React with TypeScript for type-safe component development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management and caching
- Shadcn/ui component library built on Radix UI primitives
- Tailwind CSS for utility-first styling

**Design System:**
- Custom design tokens defined in `design_guidelines.md` following a Robinhood/Bloomberg hybrid approach
- Typography system using Inter for UI and JetBrains Mono for financial data
- Trading-specific color palette with dedicated positive/negative colors for price movements
- Component variants optimized for information density and data visualization

**Key UI Patterns:**
- Sidebar navigation with collapsible state management
- Real-time market ticker with auto-scrolling player prices
- Card-based layout for dashboard widgets and player information
- Today's games widget showing live/scheduled NBA games (responsive: horizontal scroll on mobile, grid on desktop)
- Mining widget with enhanced player selection dialog:
  - Search bar for filtering players by name
  - Team dropdown filter (all teams + individual teams)
  - Expandable PlayerCard components with season stats and recent games
  - Stats loaded on-demand when card is expanded
- Tabbed interfaces for contests, portfolio views, and order management
- Modal dialogs for trade execution, contest entry, and player mining selection
- WebSocket connection for live data updates with automatic query invalidation

**Mobile-Responsive Patterns:**
- Games widget: `<ScrollArea>` horizontal carousel on mobile (<sm), responsive grid on desktop (>=sm)
- Player selection: Searchable command palette with collapsible stat cards
- Breakpoint strategy: Tailwind `sm:` prefix for tablet/desktop layouts

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript
- HTTP server with WebSocket support for real-time updates
- Session-based request logging middleware
- Vite integration for development with HMR

**Data Layer:**
- Drizzle ORM for type-safe database queries
- PostgreSQL database via Neon serverless
- Schema-first design with Zod validation integration
- Connection pooling for efficient database access

**Core Domain Models:**
- **Users:** Account management with virtual currency balance and premium status
- **Players:** NBA player data with real-time pricing and market metrics
- **Holdings:** User ownership tracking with cost basis calculation
- **Orders:** Limit and market order management with order book
- **Trades:** Transaction history and execution records
- **Mining:** Player share mining mechanics with cooldown timers
- **Contests:** 50/50 contest structure with entry and lineup management
- **Price History:** Time-series data for charting and analytics

**API Design:**
- RESTful endpoints organized by domain (players, orders, contests, portfolio)
- `/api/games/today` - Today's NBA games (ET timezone-aware)
- WebSocket connections for live price updates and trade notifications
- Aggregated dashboard endpoint for optimized data loading
- Real-time leaderboard updates during active contests

### Database Schema

**Key Tables:**
- `users` - User accounts with balance and premium subscription tracking
- `players` - NBA player master data with current market pricing
- `holdings` - User asset ownership with quantity and cost basis
- `orders` - Active and historical orders with status tracking
- `trades` - Completed transaction records
- `mining` - Mining session state with cooldown management
- `contests` - Contest definitions with prize pools and scheduling
- `contest_entries` - User contest participation with scoring
- `contest_lineups` - Player selections for contest entries
- `player_game_stats` - Historical game performance data
- `price_history` - Time-series pricing data for charting

**Indexing Strategy:**
- Composite indexes on user-asset relationships for fast holdings lookup
- Team and active status indexes on players for marketplace filtering
- Status and timestamp indexes on orders for order book queries

### External Dependencies

**MySportsFeeds API Integration:**
- NBA player roster data synchronization via `/player_gamelogs.json` and `/seasonal_player_stats.json`
- Real-time game statistics for fantasy scoring
- Player injury status and roster changes
- API key authentication with gzip compression
- **Player Stats Endpoints:**
  - `/api/player/:id/stats` - Season averages (PPG, RPG, APG, FG%, 3P%, FT%, STL, BLK, MPG, GP)
  - `/api/player/:id/recent-games` - Last 5 games with box scores (PTS, REB, AST, FG details)
  - Defensive null safety for missing stats (returns empty/default values)
  - Stats fetched on-demand when player card is expanded (not on initial load)
- NO mock data - all data comes from paid MySportsFeeds Core + Stats subscription

**Third-Party Services:**
- Neon Database for serverless PostgreSQL hosting
- WebSocket server for real-time client updates
- Google Fonts CDN for Inter and JetBrains Mono typography

**Authentication:**
- Simplified session-based authentication (MVP implementation)
- Default demo user creation for development
- Placeholder for future OAuth integration

**Real-Time Features:**
- WebSocket server on `/ws` path for live updates
- Centralized broadcast mechanism via `server/websocket.ts`
- Live game stats polling (every 1 minute for in-progress games)
- Broadcasts `liveStats`, `portfolio`, `mining`, `orderBook`, and `trade` events
- Frontend auto-invalidates React Query cache on WebSocket updates
- Client reconnection handling for market data streaming

**Background Jobs (Cron):**
- **roster_sync**: Daily at 5 AM ET - Syncs NBA player rosters from MySportsFeeds
- **schedule_sync**: Every 6 hours - Updates game schedules
- **stats_sync**: Hourly - Processes stats for completed games
- **stats_sync_live**: Every minute - Real-time stats for in-progress games only (short-circuits if no live games)

**Development Tools:**
- Replit-specific plugins for runtime error overlay and development banner
- Cartographer plugin for code navigation in Replit environment
- TSX for TypeScript execution in development mode
- ESBuild for production bundling