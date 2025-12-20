# Sportfolio - Fantasy Sports Stock Market Platform

## Overview
Sportfolio is a fantasy sports trading platform that gamifies NBA player performance by allowing users to trade player shares like stocks. It integrates real-time sports data with financial trading mechanics, featuring player share vesting, 50/50 contests, and a professional-grade trading interface. The platform aims to provide an engaging experience for sports fans, blending fantasy sports with financial market dynamics, with ambitions to expand to other sports and achieve sub-500ms response times for all major endpoints.

## User Preferences
Preferred communication style: Simple, everyday language.

CRITICAL RULE: Never use mock, sample, or placeholder data under any circumstances. All data must come from live API sources (MySportsFeeds). If API data is unavailable, show empty states or loading indicators - never fabricate data.

**MARKET DATA INTEGRITY RULE:** Market prices must ONLY be derived from actual executed trades. Never display fabricated bid/ask prices, market values, or price histories. If no trades have occurred, show an explicit empty state (e.g., "No trades yet" or "Price not established"). The current market value is ALWAYS the most recent trade price - nothing else. This applies to both player shares and premium shares.

## System Architecture

### Authentication System
The platform uses **Supabase Auth** for authentication with JWT tokens. Key components:
- **Backend Middleware** (`server/supabaseAuth.ts`): Verifies JWT tokens from Supabase using the service role key. Uses `isAuthenticated` and `optionalAuth` middleware functions. User IDs are accessed via `req.user.claims.sub`.
- **Frontend Hook** (`client/src/hooks/useAuth.ts`): Manages auth state with Supabase session management. Provides `login`, `signup`, `logout`, and `loginWithGoogle` functions. Passes Bearer tokens to API requests.
- **Login Page** (`client/src/pages/Login.tsx`): Email/password login and signup with Google OAuth option. Routes at `/login` and `/auth/callback`.
- **Environment Secrets**: Requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- **Dev Bypass**: In development mode (`NODE_ENV=development`), auth can be bypassed using a mock user for testing.

### Frontend
The frontend is built with React, TypeScript, Vite, Wouter for routing, and TanStack Query for server state management. It utilizes Shadcn/ui (Radix UI, Tailwind CSS) for a Bloomberg terminal-inspired aesthetic, featuring JetBrains Mono typography, sharp corners, sidebar navigation, real-time market ticker, and card-based responsive layouts. Mobile experience is prioritized with bottom navigation. Authentication uses the `useAuth()` hook for graceful handling of unauthenticated sessions, allowing public access to market data. Real-time updates are managed via a centralized cache invalidation utility and WebSocket provider, complemented by a notification system for background events.

### Backend
The backend is an Express.js server developed with TypeScript, supporting both HTTP and WebSockets. It uses Drizzle ORM with a PostgreSQL database (Neon serverless) and Zod for validation. Core domain models include Users, Players, Holdings, Orders, Trades, Mining, Contests, and Price History. The system ensures atomic balance updates and precise timezone handling. API design follows RESTful principles for data and WebSockets for live updates. Player IDs from MySportsFeeds API are used for consistency. A season filtering system provides intelligent season resolution based on the NBA calendar, and game logs are efficiently cached.

**Database Schema Highlights:**
Key tables include `users`, `players`, `holdings`, `orders`, `trades`, `mining`, `contests`, `player_game_stats`, `price_history`, and specific tables for premium share trading: `premium_checkout_sessions`, `premium_orders`, `premium_trades`. Indexing is optimized for user-asset relationships, player filtering, and order book queries. Share and cash locking mechanisms prevent double-spending.

**Premium Share Trading:**
Users can purchase premium shares via Whop, which can be redeemed for premium access (double vesting rate, no ads) or traded as in-game assets. Dedicated API endpoints and database tables manage premium share orders and trades, with Webhooks from Whop handling payment completion.

**Cross-Platform Whop Sync:**
The platform implements cross-platform interoperability for premium share purchases. Users who purchase premium shares directly on Whop's website (outside of Sportfolio) will automatically have their shares credited when they log in to Sportfolio, matched by email address. Key components:
- `whop_payments` table tracks all Whop payments by payment_id (unique key), with email matching and creditedAt/revokedAt timestamps
- Auto-sync on login: `/api/auth/user?sync=true` triggers payment reconciliation using Whop SDK
- Manual sync: `/api/whop/sync` endpoint with "Sync" button on premium page
- Admin sync: `/api/admin/whop/sync` allows admins to sync any user by email/username
- Refund handling: Detects refunded/disputed/chargedback payments and revokes shares from holdings, creating liability records if shares were already traded

**Timezone Handling:**
All game scheduling and related queries are critically based on Eastern Time (ET). A centralized time utility library ensures consistency across the platform, converting UTC database timestamps to ET for game day determination and display.

### Order Matching Engine
The platform uses a centralized order matching engine in `server/order-matcher.ts` that handles limit order matching for both API and bot-placed orders:
- `matchOrders(playerId)`: Matches crossing limit orders using price-time priority (FIFO), executing trades at the sell price
- `placeBotLimitOrder()`: Used by bots to place orders with proper resource locking and automatic matching
- Handles cash/share locking, balance updates, holdings updates, player price updates, and real-time WebSocket broadcasts
- Both routes.ts and bot strategies import from this shared module to ensure consistent matching behavior
- Order book includes both "open" and "partial" status orders to allow continued matching of partially filled orders

**Market Order Preview:**
The `/api/orders/:playerId/preview` endpoint simulates market order execution before placing:
- Accepts `side` (buy/sell) and `quantity` as query parameters
- Returns fill breakdown (price levels, quantities, costs), average price, slippage percentage, and total cost
- Helps users understand price impact before executing large market orders
- Player page shows live preview when entering market order quantities

**Trading UI Help:**
Order type tooltips explain the difference between Limit and Market orders with Sportfolio-specific examples to help new users understand trading mechanics.

### Background Jobs
`node-cron` manages background jobs for `roster_sync`, `schedule_sync`, `stats_sync`, `update_contest_statuses`, `settle_contests`, `create_contests`, and `bot_engine`. A Contest Lifecycle & Settlement System automates contest progression. A Universal Live Logging System provides real-time SSE-based logs for admin operations.

### Design Principles
The UI prioritizes information density and compact layouts, similar to professional financial trading platforms. Interactive elements like clickable player names and usernames lead to modals or profile pages. A Player Information System offers a `PlayerModal` and a dedicated `Player Page` for detailed trading with charts and order books. Public marketplace access is available without authentication.

### Data Analytics & Original Content
The platform features an Analytics Page (`/analytics`) with a Market Health Dashboard displaying key metrics (Market Cap, Transactions, Volume, Shares Vested/Burned/Total) over time. A Market Snapshots system captures daily metric snapshots. Tabs for Overview, Rankings, Compare (multi-player), and Positions offer in-depth analysis. Power Rankings are calculated based on price momentum, volume, and fantasy points. Leaderboards (`/leaderboards`) track net worth, portfolio value, cash balance, shares vested, and market orders, with real-time WebSocket updates. A Weekly Roundup Generator creates automated blog posts summarizing market activity for SEO and user engagement.

### Content & SEO
A blog system (`/blog`) provides admin-controlled content. Static pages (`/privacy`, `/terms`, `/about`, `/contact`, `/how-it-works`) ensure comprehensive user guidance and AdSense compliance. The platform implements comprehensive SEO through `robots.txt`, dynamic `sitemap.xml`, JSON-LD structured data (Organization, WebSite, WebApplication, Article, Person, FAQPage schemas), and dynamic meta tags for blog posts and player pages.

### Monetization - Whop Ads
The platform uses Whop for ad monetization, embedding iframes via a reusable `WhopAd` React component in various sections like the Marketplace, Dashboard, and Contests.

## External Dependencies

-   **MySportsFeeds API:** NBA player rosters, game schedules, and statistics.
-   **Neon Database:** Serverless PostgreSQL.
-   **WebSocket Server:** Custom implementation for real-time updates.
-   **Plain Text Sports:** External link for live game statistics.
-   **Google Fonts CDN:** Typography.
-   **Google Analytics 4:** Tracking and analytics.
-   **Whop:** Ad monetization and premium share purchasing.
-   **Supabase Auth:** User authentication with JWT tokens and email/password or Google OAuth.