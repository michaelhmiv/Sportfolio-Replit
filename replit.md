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
- Tabbed interfaces for contests, portfolio views, and order management
- Modal dialogs for trade execution and contest entry

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
- NBA player roster data synchronization
- Real-time game statistics for fantasy scoring
- Player injury status and roster changes
- API key authentication with gzip compression
- Mock data fallback for development without API key

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
- Broadcast mechanism for price changes and trade executions
- Client reconnection handling for market data streaming

**Development Tools:**
- Replit-specific plugins for runtime error overlay and development banner
- Cartographer plugin for code navigation in Replit environment
- TSX for TypeScript execution in development mode
- ESBuild for production bundling