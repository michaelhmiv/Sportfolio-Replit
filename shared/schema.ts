import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, decimal, integer, timestamp, boolean, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table - core user account
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Replit Auth fields
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // App-specific fields
  username: text("username").unique(), // Optional username, defaults to email
  balance: decimal("balance", { precision: 20, scale: 2 }).notNull().default("10000.00"), // Starting balance: $10,000
  isAdmin: boolean("is_admin").notNull().default(false), // Admin access to system management
  isPremium: boolean("is_premium").notNull().default(false),
  premiumExpiresAt: timestamp("premium_expires_at"),
  hasSeenOnboarding: boolean("has_seen_onboarding").notNull().default(false), // Track if user completed onboarding
  // Profile stats
  totalSharesMined: integer("total_shares_mined").notNull().default(0),
  totalMarketOrders: integer("total_market_orders").notNull().default(0),
  totalTradesExecuted: integer("total_trades_executed").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Players table - NBA players from MySportsFeeds
export const players = pgTable("players", {
  id: varchar("id").primaryKey(), // MySportsFeeds player ID
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  team: text("team").notNull(),
  position: text("position").notNull(),
  jerseyNumber: text("jersey_number"),
  isActive: boolean("is_active").notNull().default(true), // On active roster
  isEligibleForMining: boolean("is_eligible_for_mining").notNull().default(true),
  currentPrice: decimal("current_price", { precision: 10, scale: 2 }).notNull().default("10.00"), // Placeholder - use lastTradePrice for real market value
  lastTradePrice: decimal("last_trade_price", { precision: 10, scale: 2 }), // Actual market price from last trade, null if no trades
  volume24h: integer("volume_24h").notNull().default(0),
  priceChange24h: decimal("price_change_24h", { precision: 10, scale: 2 }).notNull().default("0.00"),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
}, (table) => ({
  teamIdx: index("team_idx").on(table.team),
  activeIdx: index("active_idx").on(table.isActive),
  positionIdx: index("position_idx").on(table.position),
  nameIdx: index("name_idx").on(table.firstName, table.lastName),
  lastTradePriceIdx: index("last_trade_price_idx").on(table.lastTradePrice),
  volume24hIdx: index("volume_24h_idx").on(table.volume24h),
  priceChange24hIdx: index("price_change_24h_idx").on(table.priceChange24h),
}));

// Holdings table - user ownership of player shares and premium shares
export const holdings = pgTable("holdings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assetType: text("asset_type").notNull(), // "player" or "premium"
  assetId: text("asset_id").notNull(), // player ID or "premium"
  quantity: integer("quantity").notNull().default(0),
  avgCostBasis: decimal("avg_cost_basis", { precision: 10, scale: 4 }).notNull().default("0.0000"), // Average cost per share
  totalCostBasis: decimal("total_cost_basis", { precision: 20, scale: 2 }).notNull().default("0.00"), // Total invested
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
}, (table) => ({
  userAssetIdx: index("user_asset_idx").on(table.userId, table.assetType, table.assetId),
}));

// Holdings locks table - tracks reserved/locked shares to prevent double-spending
// Available shares = holdings.quantity - SUM(holdings_locks.lockedQuantity)
export const holdingsLocks = pgTable("holdings_locks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assetType: text("asset_type").notNull(), // "player" or "premium"
  assetId: text("asset_id").notNull(), // player ID or "premium"
  lockType: text("lock_type").notNull(), // "order", "contest", "mining"
  lockReferenceId: varchar("lock_reference_id").notNull(), // order ID, contest entry ID, or mining record ID
  lockedQuantity: integer("locked_quantity").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userAssetIdx: index("locks_user_asset_idx").on(table.userId, table.assetType, table.assetId),
  referenceIdx: index("locks_reference_idx").on(table.lockReferenceId),
  lockTypeIdx: index("locks_type_idx").on(table.lockType),
}));

// Balance locks table - tracks reserved cash to prevent double-spending
// Available balance = users.balance - SUM(balance_locks.lockedAmount)
export const balanceLocks = pgTable("balance_locks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lockType: text("lock_type").notNull(), // "order" (for buy orders)
  lockReferenceId: varchar("lock_reference_id").notNull(), // order ID
  lockedAmount: decimal("locked_amount", { precision: 20, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("balance_locks_user_idx").on(table.userId),
  referenceIdx: index("balance_locks_reference_idx").on(table.lockReferenceId),
  lockTypeIdx: index("balance_locks_type_idx").on(table.lockType),
}));

// Orders table - limit and market orders on the order book
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  playerId: varchar("player_id").notNull().references(() => players.id),
  orderType: text("order_type").notNull(), // "limit" or "market"
  side: text("side").notNull(), // "buy" or "sell"
  quantity: integer("quantity").notNull(),
  filledQuantity: integer("filled_quantity").notNull().default(0),
  limitPrice: decimal("limit_price", { precision: 10, scale: 2 }), // null for market orders
  status: text("status").notNull().default("open"), // "open", "filled", "cancelled", "partial"
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  playerSideIdx: index("player_side_idx").on(table.playerId, table.side, table.status),
  userIdx: index("user_idx").on(table.userId),
}));

// Trades table - executed trade history
export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  buyOrderId: varchar("buy_order_id").references(() => orders.id),
  sellOrderId: varchar("sell_order_id").references(() => orders.id),
  quantity: integer("quantity").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
}, (table) => ({
  playerIdx: index("player_trade_idx").on(table.playerId),
  executedIdx: index("executed_idx").on(table.executedAt),
}));

// Mining table - tracks user mining state
export const mining = pgTable("mining", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  playerId: varchar("player_id").references(() => players.id), // null for premium users with split mining
  sharesAccumulated: integer("shares_accumulated").notNull().default(0),
  residualMs: integer("residual_ms").notNull().default(0), // Fractional time carryover in milliseconds
  lastAccruedAt: timestamp("last_accrued_at").notNull().defaultNow(), // Baseline timestamp for accrual calculation
  lastClaimedAt: timestamp("last_claimed_at"),
  capReachedAt: timestamp("cap_reached_at"), // When they hit their cap
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Mining splits table - for premium users splitting mining across players
export const miningSplits = pgTable("mining_splits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  playerId: varchar("player_id").notNull().references(() => players.id),
  sharesPerHour: integer("shares_per_hour").notNull(),
}, (table) => ({
  userIdx: index("user_split_idx").on(table.userId),
}));

// Mining claims table - immutable log of individual claim events
export const miningClaims = pgTable("mining_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  playerId: varchar("player_id").references(() => players.id), // null for premium split mining
  sharesClaimed: integer("shares_claimed").notNull(),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("mining_claims_user_idx").on(table.userId),
  claimedAtIdx: index("mining_claims_claimed_at_idx").on(table.claimedAt),
}));

// Contests table
export const contests = pgTable("contests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sport: text("sport").notNull().default("NBA"),
  contestType: text("contest_type").notNull().default("50/50"),
  gameDate: timestamp("game_date").notNull(), // Date of games this contest covers
  status: text("status").notNull().default("open"), // "open", "live", "completed"
  entryFee: decimal("entry_fee", { precision: 20, scale: 2 }).notNull().default("0.00"), // Entry fee per contest
  totalSharesEntered: integer("total_shares_entered").notNull().default(0),
  totalPrizePool: decimal("total_prize_pool", { precision: 20, scale: 2 }).notNull().default("0.00"),
  entryCount: integer("entry_count").notNull().default(0),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("contest_status_idx").on(table.status),
}));

// Contest entries table
export const contestEntries = pgTable("contest_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contestId: varchar("contest_id").notNull().references(() => contests.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  totalSharesEntered: integer("total_shares_entered").notNull().default(0),
  totalScore: decimal("total_score", { precision: 10, scale: 2 }).notNull().default("0.00"),
  rank: integer("rank"),
  payout: decimal("payout", { precision: 20, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  contestUserIdx: index("contest_user_idx").on(table.contestId, table.userId),
}));

// Contest lineup table - specific player shares entered in a contest
export const contestLineups = pgTable("contest_lineups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entryId: varchar("entry_id").notNull().references(() => contestEntries.id, { onDelete: "cascade" }),
  playerId: varchar("player_id").notNull().references(() => players.id),
  sharesEntered: integer("shares_entered").notNull(),
  fantasyPoints: decimal("fantasy_points", { precision: 10, scale: 2 }).notNull().default("0.00"),
  earnedScore: decimal("earned_score", { precision: 10, scale: 2 }).notNull().default("0.00"), // Pro-rated score
}, (table) => ({
  entryIdx: index("entry_idx").on(table.entryId),
}));

// Player game stats table - from MySportsFeeds
export const playerGameStats = pgTable("player_game_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id),
  gameId: text("game_id").notNull(), // MySportsFeeds game ID
  gameDate: timestamp("game_date").notNull(),
  season: text("season").notNull().default("2024-2025-regular"), // Track season for historical data
  opponentTeam: text("opponent_team"), // Opponent abbreviation
  homeAway: text("home_away"), // "home" or "away"
  minutes: integer("minutes").notNull().default(0), // Minutes played
  points: integer("points").notNull().default(0),
  fieldGoalsMade: integer("field_goals_made").notNull().default(0),
  fieldGoalsAttempted: integer("field_goals_attempted").notNull().default(0),
  threePointersMade: integer("three_pointers_made").notNull().default(0),
  threePointersAttempted: integer("three_pointers_attempted").notNull().default(0),
  freeThrowsMade: integer("free_throws_made").notNull().default(0),
  freeThrowsAttempted: integer("free_throws_attempted").notNull().default(0),
  rebounds: integer("rebounds").notNull().default(0),
  assists: integer("assists").notNull().default(0),
  steals: integer("steals").notNull().default(0),
  blocks: integer("blocks").notNull().default(0),
  turnovers: integer("turnovers").notNull().default(0),
  isDoubleDouble: boolean("is_double_double").notNull().default(false),
  isTripleDouble: boolean("is_triple_double").notNull().default(false),
  fantasyPoints: decimal("fantasy_points", { precision: 10, scale: 2 }).notNull().default("0.00"),
  lastFetchedAt: timestamp("last_fetched_at").notNull().defaultNow(), // Track ingestion time
}, (table) => ({
  playerGameIdx: index("player_game_idx").on(table.playerId, table.gameId),
}));

// Price history table - for charts
export const priceHistory = pgTable("price_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  volume: integer("volume").notNull().default(0),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  playerTimeIdx: index("player_time_idx").on(table.playerId, table.timestamp),
}));

// Daily games table - cached game schedules from MySportsFeeds
export const dailyGames = pgTable("daily_games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: text("game_id").notNull().unique(), // MySportsFeeds game ID
  date: timestamp("date").notNull(), // Game date
  homeTeam: text("home_team").notNull(), // Team abbreviation
  awayTeam: text("away_team").notNull(), // Team abbreviation
  venue: text("venue"),
  status: text("status").notNull().default("scheduled"), // "scheduled", "inprogress", "completed"
  startTime: timestamp("start_time").notNull(),
  homeScore: integer("home_score"), // null for scheduled games
  awayScore: integer("away_score"), // null for scheduled games
  lastFetchedAt: timestamp("last_fetched_at").notNull().defaultNow(),
}, (table) => ({
  dateIdx: index("daily_games_date_idx").on(table.date),
  statusIdx: index("daily_games_status_idx").on(table.status),
  gameIdDateIdx: index("daily_games_game_date_idx").on(table.gameId, table.date),
}));

// Job execution logs - track sync job runs for monitoring
export const jobExecutionLogs = pgTable("job_execution_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobName: text("job_name").notNull(), // e.g., "roster_sync", "schedule_sync", "stats_sync"
  scheduledFor: timestamp("scheduled_for").notNull(), // When job was supposed to run
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  status: text("status").notNull().default("running"), // "running", "success", "failed", "degraded"
  errorMessage: text("error_message"),
  requestCount: integer("request_count").notNull().default(0), // API requests made during job
  recordsProcessed: integer("records_processed").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0), // Number of failed records
}, (table) => ({
  jobNameIdx: index("job_name_idx").on(table.jobName),
  scheduledIdx: index("scheduled_idx").on(table.scheduledFor),
}));

// Blog posts table - admin-created content for SEO and user engagement
export const blogPosts = pgTable("blog_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(), // URL-friendly version of title
  excerpt: text("excerpt").notNull(), // Brief summary for listing pages
  content: text("content").notNull(), // Full blog post content (can be markdown or HTML)
  authorId: varchar("author_id").notNull().references(() => users.id),
  publishedAt: timestamp("published_at"), // null = draft, non-null = published
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("blog_slug_idx").on(table.slug),
  publishedIdx: index("blog_published_idx").on(table.publishedAt),
  authorIdx: index("blog_author_idx").on(table.authorId),
}));

// Portfolio snapshots table - daily snapshots of user portfolio metrics for historical tracking and rank changes
export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  snapshotDate: timestamp("snapshot_date").notNull(), // Date this snapshot was taken (UTC midnight)
  cashBalance: decimal("cash_balance", { precision: 20, scale: 2 }).notNull(),
  portfolioValue: decimal("portfolio_value", { precision: 20, scale: 2 }).notNull(),
  totalNetWorth: decimal("total_net_worth", { precision: 20, scale: 2 }).notNull(), // cashBalance + portfolioValue
  cashRank: integer("cash_rank"), // User's rank on cash balance leaderboard
  portfolioRank: integer("portfolio_rank"), // User's rank on portfolio value leaderboard
  netWorthRank: integer("net_worth_rank"), // User's rank on total net worth leaderboard
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userDateIdx: index("portfolio_snapshots_user_date_idx").on(table.userId, table.snapshotDate),
  dateIdx: index("portfolio_snapshots_date_idx").on(table.snapshotDate),
}));

// Market snapshots table - daily snapshots of platform-wide market metrics for analytics charts
export const marketSnapshots = pgTable("market_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotDate: timestamp("snapshot_date").notNull().unique(), // One row per day (UTC midnight)
  marketCap: decimal("market_cap", { precision: 20, scale: 2 }).notNull(), // Total value of all shares (shares * price)
  transactionsCount: integer("transactions_count").notNull().default(0), // Number of trades that day
  volume: decimal("volume", { precision: 20, scale: 2 }).notNull().default("0"), // Total trading volume that day
  sharesMined: integer("shares_mined").notNull().default(0), // Shares mined that day
  sharesBurned: integer("shares_burned").notNull().default(0), // Shares used in contests that day
  totalShares: integer("total_shares").notNull().default(0), // Total shares in economy (snapshot)
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  dateIdx: index("market_snapshots_date_idx").on(table.snapshotDate),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  holdings: many(holdings),
  orders: many(orders),
  contestEntries: many(contestEntries),
  blogPosts: many(blogPosts),
  portfolioSnapshots: many(portfolioSnapshots),
}));

export const blogPostsRelations = relations(blogPosts, ({ one }) => ({
  author: one(users, {
    fields: [blogPosts.authorId],
    references: [users.id],
  }),
}));

export const portfolioSnapshotsRelations = relations(portfolioSnapshots, ({ one }) => ({
  user: one(users, {
    fields: [portfolioSnapshots.userId],
    references: [users.id],
  }),
}));

export const playersRelations = relations(players, ({ many }) => ({
  holdings: many(holdings),
  orders: many(orders),
  trades: many(trades),
  gameStats: many(playerGameStats),
  priceHistory: many(priceHistory),
}));

export const holdingsRelations = relations(holdings, ({ one }) => ({
  user: one(users, {
    fields: [holdings.userId],
    references: [users.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  player: one(players, {
    fields: [orders.playerId],
    references: [players.id],
  }),
}));

export const contestsRelations = relations(contests, ({ many }) => ({
  entries: many(contestEntries),
}));

export const contestEntriesRelations = relations(contestEntries, ({ one, many }) => ({
  contest: one(contests, {
    fields: [contestEntries.contestId],
    references: [contests.id],
  }),
  user: one(users, {
    fields: [contestEntries.userId],
    references: [users.id],
  }),
  lineups: many(contestLineups),
}));

export const contestLineupsRelations = relations(contestLineups, ({ one }) => ({
  entry: one(contestEntries, {
    fields: [contestLineups.entryId],
    references: [contestEntries.id],
  }),
  player: one(players, {
    fields: [contestLineups.playerId],
    references: [players.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  lastUpdated: true,
});

export const insertHoldingSchema = createInsertSchema(holdings).omit({
  id: true,
  lastUpdated: true,
});

export const insertHoldingsLockSchema = createInsertSchema(holdingsLocks).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  filledQuantity: true,
  status: true,
  createdAt: true,
}).extend({
  quantity: z.number().int().positive(),
  limitPrice: z.string().optional(),
});

export const insertContestEntrySchema = createInsertSchema(contestEntries).omit({
  id: true,
  totalScore: true,
  rank: true,
  payout: true,
  createdAt: true,
});

export const insertContestLineupSchema = createInsertSchema(contestLineups).omit({
  id: true,
  fantasyPoints: true,
  earnedScore: true,
});

export const insertDailyGameSchema = createInsertSchema(dailyGames).omit({
  id: true,
  lastFetchedAt: true,
});

export const insertJobExecutionLogSchema = createInsertSchema(jobExecutionLogs).omit({
  id: true,
  startedAt: true,
});

export const insertPlayerGameStatsSchema = createInsertSchema(playerGameStats).omit({
  id: true,
  lastFetchedAt: true,
});

export const insertMiningClaimSchema = createInsertSchema(miningClaims).omit({
  id: true,
  claimedAt: true,
});

// Select types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = typeof users.$inferInsert; // For Replit Auth upsert operation

export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;

export type Holding = typeof holdings.$inferSelect;
export type InsertHolding = z.infer<typeof insertHoldingSchema>;

export type HoldingsLock = typeof holdingsLocks.$inferSelect;
export type InsertHoldingsLock = z.infer<typeof insertHoldingsLockSchema>;

export type BalanceLock = typeof balanceLocks.$inferSelect;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type Trade = typeof trades.$inferSelect;

export type Mining = typeof mining.$inferSelect;

export type MiningSplit = typeof miningSplits.$inferSelect;
export type InsertMiningSplit = typeof miningSplits.$inferInsert;

export type MiningClaim = typeof miningClaims.$inferSelect;
export type InsertMiningClaim = z.infer<typeof insertMiningClaimSchema>;

export type DailyGame = typeof dailyGames.$inferSelect;
export type InsertDailyGame = z.infer<typeof insertDailyGameSchema>;

export type JobExecutionLog = typeof jobExecutionLogs.$inferSelect;
export type InsertJobExecutionLog = z.infer<typeof insertJobExecutionLogSchema>;

export type PlayerGameStats = typeof playerGameStats.$inferSelect;
export type InsertPlayerGameStats = z.infer<typeof insertPlayerGameStatsSchema>;

export type Contest = typeof contests.$inferSelect;
export type ContestEntry = typeof contestEntries.$inferSelect;
export type ContestLineup = typeof contestLineups.$inferSelect;

export type PriceHistory = typeof priceHistory.$inferSelect;

export type InsertContestEntry = z.infer<typeof insertContestEntrySchema>;
export type InsertContestLineup = z.infer<typeof insertContestLineupSchema>;

export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;

export const insertPortfolioSnapshotSchema = createInsertSchema(portfolioSnapshots).omit({
  id: true,
  createdAt: true,
});

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
export type InsertPortfolioSnapshot = z.infer<typeof insertPortfolioSnapshotSchema>;

export const insertMarketSnapshotSchema = createInsertSchema(marketSnapshots).omit({
  id: true,
  createdAt: true,
});

export type MarketSnapshot = typeof marketSnapshots.$inferSelect;
export type InsertMarketSnapshot = z.infer<typeof insertMarketSnapshotSchema>;
