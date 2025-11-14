# Sportfolio Design Guidelines: Data-Driven Trading Platform

## Design Approach

**Primary Reference:** Robinhood + Bloomberg Terminal hybrid
- Robinhood's clean, modern trading interface and frictionless UX
- Bloomberg's information density and real-time data displays
- Linear's typography clarity for data readability
- Stripe's restrained use of color for financial applications

**Core Principle:** Maximum information density with absolute clarity. Every pixel serves the trader's decision-making process.

## Typography System

**Font Stack:** 
- Primary: Inter (for UI and data displays)
- Monospace: JetBrains Mono (for prices, numbers, and financial data)

**Hierarchy:**
- Hero Numbers (prices, balances): 48px-64px, Bold, Monospace
- Section Headers: 24px-32px, Semibold
- Data Labels: 14px, Medium (uppercase, letter-spacing: 0.5px)
- Body/Trade Details: 16px, Regular
- Small Data (timestamps, IDs): 12px, Regular, Monospace

## Layout & Spacing

**Spacing Primitives:** Tailwind units of 1, 2, 4, 6, 8
- Tight data grids: p-1, gap-2
- Component padding: p-4, p-6
- Section spacing: py-8, py-12
- Page margins: px-4 (mobile), px-8 (desktop)

**Grid System:**
- Dashboard: 12-column grid with 2-3 column widget cards
- Trading Interface: 70/30 split (chart/data vs. trading panel)
- Order Book: Dense table layout with minimal padding

## Component Library

### Navigation
- **Top Bar:** Fixed, dark, slim (h-16) with logo left, user balance/portfolio value center-right, profile right
- **Sidebar:** Collapsible left nav (w-64) with icons + labels, active state indicators
- **Mobile:** Bottom tab bar (fixed) with 5 core sections

### Data Display Components

**Price Cards:**
- Large monospace price as hero element
- Green/red percentage change with arrow icons
- Compact sparkline (24h trend) below price
- Minimal card chrome, maximum data density

**Market Ticker:**
- Horizontal auto-scrolling banner (h-12)
- Player name + current price + 24h change cycling continuously
- No background, uses subtle borders to separate items

**Order Book Display:**
- Two-column table (Bids left, Asks right)
- Price (monospace, bold) + Quantity + Total columns
- Top bid/ask highlighted with subtle background
- Premium: 10 levels deep, Free: Top level only
- Price color coding: Bids green, Asks red (muted tones)

**Charts:**
- Candlestick/Line charts using Recharts
- Time period toggles (1D/1W/1M/1Y) as pill buttons above chart
- Minimal gridlines, clear axis labels
- Premium overlays: MA lines (different opacities), RSI subplot below

**Mining Widget:**
- Compact card with circular progress indicator
- "XXX / 2,400 shares" in large monospace
- Player avatar(s) being mined with small badges
- Prominent "Claim All" button (full-width, primary CTA)

**Contest Cards:**
- Card format: Sport badge + Contest name + Prize pool (large $) + Shares entered
- Live indicator dot for active contests
- Progress bar showing fill percentage
- "Enter" CTA button (secondary style)

### Trading Interface

**Trading Panel:**
- Tab switcher: "Limit" | "Market" (Quick Buy/Sell)
- Quantity input with "Max" button inline
- Price input (Limit orders only)
- Real-time calculation display: "Total Cost: $XXX.XX"
- Large action button: "Buy Shares" or "Sell Shares" (full-width)
- Balance check indicator below (Available: $XXX)

**Player Page Layout:**
- Top: Player name (32px) + Team/Position badges + Current price (64px monospace)
- Left (70%): Chart with time toggles
- Right (30%): Trading panel (sticky)
- Below: Order Book + Recent Trades in two-column layout
- Premium indicator in top-right corner if user has access

### Portfolio Components

**Holdings Table:**
- Columns: Asset | Qty | Avg Cost | Current | Total Value | P&L ($) | P&L (%)
- Sortable headers
- P&L color-coded (green positive, red negative)
- Row hover reveals "Trade" quick action button
- Compact row height (h-12) for density

**Open Orders List:**
- Table: Type | Player | Qty | Price | Filled | Status | Actions
- "Cancel" button (text link, red) on each row
- Real-time status updates via WebSocket

### Contest Interface

**Contest Slate Builder:**
- Split view: Left panel (Available shares), Right panel (Selected lineup)
- Left: Search bar + filters (Team, Position) + scrollable player list
- Player rows: Avatar + Name + Shares owned + "Add" button
- Right: Selected players table with quantity inputs + "Submit Entry" button
- Live total shares counter at bottom of right panel

**Live Leaderboard:**
- Sticky header: User's current rank (large) + total contestants
- Table: Rank | User | Total Points | Details (expand)
- User's row highlighted with subtle background
- Expandable details show per-player breakdown
- WebSocket live updates (smooth number animations)

## Visual Treatment

**Color Philosophy:**
- Neutral base with minimal color usage
- Color only for data signals (positive/negative, status indicators)
- Avoid decorative color - every color has semantic meaning

**Interaction States:**
- Buttons: Solid fills with subtle hover darkening
- Tables/Lists: Hover row highlight (subtle background)
- Active states: Border accent or background shift
- Focus states: Clear outline for keyboard navigation

**Elevation:**
- Minimal shadows (1-2 levels max)
- Cards use subtle borders instead of heavy shadows
- Floating panels (modals, dropdowns) use medium shadow

## Images

**No large hero images.** This is a data-first platform.

**Icon Usage:**
- Sport icons (basketball, etc.) as small badges
- Status indicators (mining active, contest live)
- Trade type icons (buy/sell arrows)
- Premium feature icon (crown/star badge)
Use Heroicons via CDN for all UI icons.

**Player Avatars:**
- Small circular thumbnails (40px-48px) in lists
- Larger (80px) on player detail pages
- Placeholder silhouettes for missing images

## Animations

**Minimal, purposeful only:**
- Number transitions (price updates, leaderboard scores): Smooth count-up
- WebSocket data updates: Gentle fade-in for new rows
- Chart updates: Smooth line/bar transitions
- No decorative animations, scrolling effects, or parallax

## Platform-Specific Patterns

**Dashboard (Homepage):**
- Dense widget grid (2-3 columns on desktop, 1 on mobile)
- All widgets same height (h-64 to h-80) for clean grid alignment
- No empty states - always show market data even for new users

**Marketplace:**
- Table-first layout with inline filtering
- Sortable columns for price/volume/change
- Click row to navigate to player page

**Contest Entry Flow:**
- Multi-step wizard feel without actual steps
- Inline validation (can't enter more shares than owned)
- Real-time eligible player filtering based on game schedule

This design prioritizes trader efficiency, data clarity, and real-time information flow above all aesthetic concerns.