import {
  users,
  players,
  holdings,
  holdingsLocks,
  balanceLocks,
  orders,
  trades,
  mining,
  miningSplits,
  miningClaims,
  contests,
  contestEntries,
  contestLineups,
  playerGameStats,
  playerSeasonSummaries,
  priceHistory,
  dailyGames,
  jobExecutionLogs,
  type User,
  type InsertUser,
  type UpsertUser,
  type Player,
  type InsertPlayer,
  type Holding,
  type HoldingsLock,
  type InsertHoldingsLock,
  type BalanceLock,
  type Order,
  type Trade,
  type Mining,
  type MiningSplit,
  type InsertMiningSplit,
  type MiningClaim,
  type InsertMiningClaim,
  type Contest,
  type ContestEntry,
  type InsertContestEntry,
  type InsertContestLineup,
  type DailyGame,
  type InsertDailyGame,
  type JobExecutionLog,
  type InsertJobExecutionLog,
  type PlayerGameStats,
  type InsertPlayerGameStats,
  type PlayerSeasonSummary,
  type InsertPlayerSeasonSummary,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserBalance(userId: string, amount: string): Promise<void>;
  updateUsername(userId: string, username: string): Promise<User | undefined>;
  incrementTotalSharesMined(userId: string, amount: number): Promise<void>;
  
  // Player methods
  getPlayers(filters?: { search?: string; team?: string; position?: string }): Promise<Player[]>;
  getPlayersPaginated(filters?: { search?: string; team?: string; position?: string; limit?: number; offset?: number }): Promise<{ players: Player[]; total: number }>;
  getPlayer(id: string): Promise<Player | undefined>;
  getPlayersByIds(ids: string[]): Promise<Player[]>;
  getTopPlayersByVolume(limit: number): Promise<Player[]>;
  upsertPlayer(player: InsertPlayer): Promise<Player>;
  getDistinctTeams(): Promise<string[]>;
  
  // Holdings methods
  getHolding(userId: string, assetType: string, assetId: string): Promise<Holding | undefined>;
  getUserHoldings(userId: string): Promise<Holding[]>;
  getUserHoldingsWithPlayers(userId: string): Promise<any[]>;
  updateHolding(userId: string, assetType: string, assetId: string, quantity: number, avgCost: string): Promise<void>;
  
  // Holdings lock methods - prevent double-spending of shares
  reserveShares(userId: string, assetType: string, assetId: string, lockType: string, lockReferenceId: string, quantity: number): Promise<HoldingsLock>;
  releaseShares(lockId: string): Promise<void>;
  releaseSharesByReference(lockReferenceId: string): Promise<void>;
  getAvailableShares(userId: string, assetType: string, assetId: string): Promise<number>;
  getLockedShares(userId: string, assetType: string, assetId: string): Promise<HoldingsLock[]>;
  getTotalLockedQuantity(userId: string, assetType: string, assetId: string): Promise<number>;
  adjustLockQuantity(lockReferenceId: string, newQuantity: number): Promise<void>;
  
  // Balance lock methods - prevent double-spending of cash
  reserveCash(userId: string, lockType: string, lockReferenceId: string, amount: string): Promise<BalanceLock>;
  releaseCash(lockId: string): Promise<void>;
  releaseCashByReference(lockReferenceId: string): Promise<void>;
  getAvailableBalance(userId: string): Promise<number>;
  getTotalLockedBalance(userId: string): Promise<number>;
  adjustLockAmount(lockReferenceId: string, newAmount: string): Promise<void>;
  
  // Order methods
  createOrder(order: any): Promise<Order>;
  getOrder(id: string): Promise<Order | undefined>;
  getUserOrders(userId: string, status?: string): Promise<Order[]>;
  getOrderBook(playerId: string): Promise<{ bids: Order[]; asks: Order[] }>;
  updateOrder(orderId: string, updates: Partial<Order>): Promise<void>;
  cancelOrder(orderId: string): Promise<void>;
  
  // Trade methods
  createTrade(trade: any): Promise<Trade>;
  getRecentTrades(playerId?: string, limit?: number): Promise<Trade[]>;
  getMarketActivity(filters?: { playerId?: string; userId?: string; limit?: number }): Promise<any[]>;
  
  // Mining methods
  getMining(userId: string): Promise<Mining | undefined>;
  updateMining(userId: string, updates: Partial<Mining>): Promise<void>;
  getMiningSplits(userId: string): Promise<MiningSplit[]>;
  setMiningSplits(userId: string, splits: InsertMiningSplit[]): Promise<void>;
  createMiningClaim(claim: InsertMiningClaim): Promise<MiningClaim>;
  
  // Activity methods
  getUserActivity(userId: string, filters?: { types?: string[]; limit?: number; offset?: number }): Promise<any[]>;
  
  // Contest methods
  getContests(status?: string): Promise<Contest[]>;
  getContest(id: string): Promise<Contest | undefined>;
  createContest(contest: InsertContest): Promise<Contest>;
  updateContest(contestId: string, updates: Partial<Contest>): Promise<void>;
  createContestEntry(entry: InsertContestEntry): Promise<ContestEntry>;
  getContestEntries(contestId: string): Promise<ContestEntry[]>;
  getUserContestEntries(userId: string): Promise<ContestEntry[]>;
  createContestLineup(lineup: InsertContestLineup): Promise<void>;
  getContestLineups(entryId: string): Promise<any[]>;
  updateContestLineup(lineupId: string, updates: any): Promise<void>;
  updateContestEntry(entryId: string, updates: Partial<ContestEntry>): Promise<void>;
  getContestEntryDetail(contestId: string, entryId: string): Promise<any>;
  
  // Daily games methods
  upsertDailyGame(game: InsertDailyGame): Promise<DailyGame>;
  getDailyGames(startDate: Date, endDate: Date): Promise<DailyGame[]>;
  updateDailyGameStatus(gameId: string, status: string): Promise<void>;
  getGamesByTeam(teamAbbreviation: string, startDate: Date, endDate: Date): Promise<DailyGame[]>;
  
  // Job execution log methods
  createJobLog(log: InsertJobExecutionLog): Promise<JobExecutionLog>;
  updateJobLog(id: string, updates: Partial<JobExecutionLog>): Promise<void>;
  getRecentJobLogs(jobName?: string, limit?: number): Promise<JobExecutionLog[]>;
  
  // Player game stats methods
  upsertPlayerGameStats(stats: InsertPlayerGameStats): Promise<PlayerGameStats>;
  getPlayerGameStats(playerId: string, gameId: string): Promise<PlayerGameStats | undefined>;
  getAllPlayerGameStats(playerId: string): Promise<PlayerGameStats[]>;
  getGameStatsByGameId(gameId: string): Promise<PlayerGameStats[]>;
  
  // Player season summaries methods (persistent stats caching)
  upsertPlayerSeasonSummary(summary: InsertPlayerSeasonSummary): Promise<PlayerSeasonSummary>;
  getPlayerSeasonSummary(playerId: string, season?: string): Promise<PlayerSeasonSummary | undefined>;
  getAllPlayerSeasonSummaries(season?: string): Promise<PlayerSeasonSummary[]>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        balance: "10000.00", // Starting balance
      })
      .returning();
    
    // Initialize mining for new user
    await db.insert(mining).values({
      userId: user.id,
      sharesAccumulated: 0,
    });
    
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        balance: userData.balance || "10000.00", // Starting balance if new user
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          username: userData.username,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    // Initialize mining for new user if it doesn't exist
    const existingMining = await db.select().from(mining).where(eq(mining.userId, user.id));
    if (existingMining.length === 0) {
      await db.insert(mining).values({
        userId: user.id,
        sharesAccumulated: 0,
      });
    }
    
    return user;
  }

  async updateUserBalance(userId: string, amount: string): Promise<void> {
    await db
      .update(users)
      .set({ balance: amount })
      .where(eq(users.id, userId));
  }

  async incrementTotalSharesMined(userId: string, amount: number): Promise<void> {
    await db
      .update(users)
      .set({ 
        totalSharesMined: sql`${users.totalSharesMined} + ${amount}`
      })
      .where(eq(users.id, userId));
  }

  async addUserBalance(userId: string, delta: number): Promise<User | undefined> {
    // Atomically increment the balance in the database
    // Drizzle handles numeric values correctly when passed directly
    await db
      .update(users)
      .set({ 
        // PostgreSQL handles the arithmetic atomically with proper precision
        balance: sql`${users.balance} + ${delta}`
      })
      .where(eq(users.id, userId));
    
    return await this.getUser(userId);
  }

  async updateUsername(userId: string, username: string): Promise<User | undefined> {
    await db
      .update(users)
      .set({ username, updatedAt: new Date() })
      .where(eq(users.id, userId));
    
    return await this.getUser(userId);
  }

  // Helper: Build player query conditions (reused by getPlayers and getPlayersPaginated)
  private buildPlayerQueryConditions(filters?: { search?: string; team?: string; position?: string }) {
    const conditions = [];
    
    if (filters?.team && filters.team !== "all") {
      conditions.push(eq(players.team, filters.team));
    }
    if (filters?.position && filters.position !== "all") {
      conditions.push(eq(players.position, filters.position));
    }
    if (filters?.search) {
      // Use SQL ILIKE for case-insensitive search on first/last name
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        sql`(${players.firstName} ILIKE ${searchTerm} OR ${players.lastName} ILIKE ${searchTerm})`
      );
    }
    
    return conditions;
  }

  // Player methods - returns full list (legacy API for backward compatibility)
  async getPlayers(filters?: { 
    search?: string; 
    team?: string; 
    position?: string;
  }): Promise<Player[]> {
    const conditions = this.buildPlayerQueryConditions(filters);
    
    // Build query in one shot to avoid type reassignment issues
    if (conditions.length > 0) {
      return await db.select().from(players).where(and(...conditions));
    }
    return await db.select().from(players);
  }

  // Paginated players - returns subset with total count (new API for performance)
  async getPlayersPaginated(filters?: { 
    search?: string; 
    team?: string; 
    position?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'price' | 'volume' | 'change' | 'bid' | 'ask';
    sortOrder?: 'asc' | 'desc';
    hasBuyOrders?: boolean;
    hasSellOrders?: boolean;
    teamsPlayingOnDate?: string[];
  }): Promise<{ players: Player[]; total: number }> {
    const { 
      search, team, position, 
      limit = 50, offset = 0,
      sortBy = 'volume',
      sortOrder = 'desc',
      hasBuyOrders,
      hasSellOrders,
      teamsPlayingOnDate
    } = filters || {};
    
    const conditions = this.buildPlayerQueryConditions({ search, team, position });
    
    // Add teams playing on date filter
    if (teamsPlayingOnDate && teamsPlayingOnDate.length > 0) {
      conditions.push(inArray(players.team, teamsPlayingOnDate));
    }
    
    // Add order book filters using EXISTS subqueries
    // Include both 'open' and 'partial' statuses (partially filled orders are still active)
    if (hasBuyOrders) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${orders} 
          WHERE ${orders.playerId} = ${players.id} 
          AND ${orders.side} = 'buy' 
          AND ${orders.status} IN ('open', 'partial')
        )`
      );
    }
    
    if (hasSellOrders) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${orders} 
          WHERE ${orders.playerId} = ${players.id} 
          AND ${orders.side} = 'sell' 
          AND ${orders.status} IN ('open', 'partial')
        )`
      );
    }
    
    // Determine sort column based on sortBy parameter
    // For price/bid/ask sorts, always use NULLS LAST so real market data appears before empty values
    let orderByClause;
    if (sortBy === 'price') {
      // Sort by lastTradePrice with NULL handling (real prices first, then NULLs)
      orderByClause = sortOrder === 'asc' 
        ? sql`${players.lastTradePrice} ASC NULLS LAST`
        : sql`${players.lastTradePrice} DESC NULLS LAST`;
    } else if (sortBy === 'volume') {
      orderByClause = sortOrder === 'asc' ? asc(players.volume24h) : desc(players.volume24h);
    } else if (sortBy === 'change') {
      orderByClause = sortOrder === 'asc' ? asc(players.priceChange24h) : desc(players.priceChange24h);
    } else if (sortBy === 'bid') {
      // Sort by best bid price (real bids first, then NULLs)
      const bestBidSubquery = sql`(
        SELECT MAX(${orders.limitPrice}) 
        FROM ${orders} 
        WHERE ${orders.playerId} = ${players.id} 
        AND ${orders.side} = 'buy' 
        AND ${orders.status} IN ('open', 'partial')
      )`;
      orderByClause = sortOrder === 'asc'
        ? sql`${bestBidSubquery} ASC NULLS LAST`
        : sql`${bestBidSubquery} DESC NULLS LAST`;
    } else if (sortBy === 'ask') {
      // Sort by best ask price (real asks first, then NULLs)
      const bestAskSubquery = sql`(
        SELECT MIN(${orders.limitPrice}) 
        FROM ${orders} 
        WHERE ${orders.playerId} = ${players.id} 
        AND ${orders.side} = 'sell' 
        AND ${orders.status} IN ('open', 'partial')
      )`;
      orderByClause = sortOrder === 'asc'
        ? sql`${bestAskSubquery} ASC NULLS LAST`
        : sql`${bestAskSubquery} DESC NULLS LAST`;
    } else {
      // Default to volume desc
      orderByClause = desc(players.volume24h);
    }
    
    // Run count and data fetch in parallel for performance
    const [countResult, playersData] = await Promise.all([
      // Count query
      conditions.length > 0
        ? db.select({ count: sql<number>`COUNT(*)::int` }).from(players).where(and(...conditions))
        : db.select({ count: sql<number>`COUNT(*)::int` }).from(players),
      // Data query with pagination and sorting
      conditions.length > 0
        ? db.select().from(players).where(and(...conditions)).orderBy(orderByClause).limit(limit).offset(offset)
        : db.select().from(players).orderBy(orderByClause).limit(limit).offset(offset),
    ]);
    
    const total = countResult[0].count;
    
    return { players: playersData, total };
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player || undefined;
  }

  async getPlayersByIds(ids: string[]): Promise<Player[]> {
    if (ids.length === 0) return [];
    return await db.select().from(players).where(inArray(players.id, ids));
  }

  async getTopPlayersByVolume(limit: number): Promise<Player[]> {
    return await db.select()
      .from(players)
      .orderBy(desc(players.volume24h))
      .limit(limit);
  }

  async upsertPlayer(player: InsertPlayer): Promise<Player> {
    const existing = await this.getPlayer(player.id);
    
    if (existing) {
      const [updated] = await db
        .update(players)
        .set({ ...player, lastUpdated: new Date() })
        .where(eq(players.id, player.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(players)
        .values(player)
        .returning();
      return created;
    }
  }

  async getDistinctTeams(): Promise<string[]> {
    const result = await db
      .selectDistinct({ team: players.team })
      .from(players)
      .where(eq(players.isActive, true))
      .orderBy(asc(players.team));
    
    return result.map(r => r.team);
  }

  // Holdings methods
  async getHolding(userId: string, assetType: string, assetId: string): Promise<Holding | undefined> {
    const [holding] = await db
      .select()
      .from(holdings)
      .where(
        and(
          eq(holdings.userId, userId),
          eq(holdings.assetType, assetType),
          eq(holdings.assetId, assetId)
        )
      );
    return holding || undefined;
  }

  async getUserHoldings(userId: string): Promise<Holding[]> {
    return await db
      .select()
      .from(holdings)
      .where(eq(holdings.userId, userId));
  }

  async getUserHoldingsWithPlayers(userId: string): Promise<any[]> {
    const result = await db
      .select({
        holding: holdings,
        player: players,
        totalLocked: sql<number>`COALESCE(SUM(${holdingsLocks.lockedQuantity}), 0)`,
      })
      .from(holdings)
      .leftJoin(players, and(
        eq(holdings.assetType, "player"),
        eq(holdings.assetId, players.id)
      ))
      .leftJoin(holdingsLocks, and(
        eq(holdingsLocks.userId, holdings.userId),
        eq(holdingsLocks.assetId, holdings.assetId),
        eq(holdingsLocks.assetType, holdings.assetType)
      ))
      .where(eq(holdings.userId, userId))
      .groupBy(holdings.id, players.id);

    return result;
  }

  async updateHolding(userId: string, assetType: string, assetId: string, quantity: number, avgCost: string): Promise<void> {
    const existing = await this.getHolding(userId, assetType, assetId);
    
    if (existing) {
      if (quantity <= 0) {
        // Remove holding - normalize to zero to avoid NaN
        await db
          .delete(holdings)
          .where(
            and(
              eq(holdings.userId, userId),
              eq(holdings.assetType, assetType),
              eq(holdings.assetId, assetId)
            )
          );
      } else {
        // Update holding - ensure proper rounding and cost basis persistence
        const avgCostParsed = parseFloat(avgCost);
        const avgCostNormalized = isNaN(avgCostParsed) ? "0.0000" : avgCostParsed.toFixed(4);
        const totalCost = (parseFloat(avgCostNormalized) * quantity).toFixed(2);
        
        await db
          .update(holdings)
          .set({
            quantity,
            avgCostBasis: avgCostNormalized,
            totalCostBasis: totalCost,
            lastUpdated: new Date(),
          })
          .where(
            and(
              eq(holdings.userId, userId),
              eq(holdings.assetType, assetType),
              eq(holdings.assetId, assetId)
            )
          );
      }
    } else if (quantity > 0) {
      // Create new holding - ensure proper rounding
      const avgCostParsed = parseFloat(avgCost);
      const avgCostNormalized = isNaN(avgCostParsed) ? "0.0000" : avgCostParsed.toFixed(4);
      const totalCost = (parseFloat(avgCostNormalized) * quantity).toFixed(2);
      
      await db.insert(holdings).values({
        userId,
        assetType,
        assetId,
        quantity,
        avgCostBasis: avgCostNormalized,
        totalCostBasis: totalCost,
      });
    }
  }

  // Holdings lock methods - prevent double-spending of shares
  async reserveShares(
    userId: string,
    assetType: string,
    assetId: string,
    lockType: string,
    lockReferenceId: string,
    quantity: number
  ): Promise<HoldingsLock> {
    // CRITICAL: Use transaction with row-level lock to prevent race conditions
    return await db.transaction(async (tx) => {
      // Step 1: Lock the holdings row to prevent concurrent modifications
      const [holding] = await tx
        .select()
        .from(holdings)
        .where(
          and(
            eq(holdings.userId, userId),
            eq(holdings.assetType, assetType),
            eq(holdings.assetId, assetId)
          )
        )
        .for('update'); // SELECT ... FOR UPDATE - prevents concurrent reservations

      if (!holding) {
        throw new Error(`No holdings found for user ${userId}, asset ${assetId}`);
      }

      // Step 2: Calculate currently locked shares within the same transaction
      const lockedResult = await tx
        .select({ total: sql<number>`COALESCE(SUM(${holdingsLocks.lockedQuantity}), 0)` })
        .from(holdingsLocks)
        .where(
          and(
            eq(holdingsLocks.userId, userId),
            eq(holdingsLocks.assetType, assetType),
            eq(holdingsLocks.assetId, assetId)
          )
        );

      const totalLocked = Number(lockedResult[0]?.total || 0);
      const available = holding.quantity - totalLocked;

      // Step 3: Check if sufficient shares are available
      if (available < quantity) {
        throw new Error(`Insufficient available shares: have ${available}, need ${quantity}`);
      }

      // Step 4: Create the lock
      const [lock] = await tx
        .insert(holdingsLocks)
        .values({
          userId,
          assetType,
          assetId,
          lockType,
          lockReferenceId,
          lockedQuantity: quantity,
        })
        .returning();

      return lock;
    });
  }

  async releaseShares(lockId: string): Promise<void> {
    await db
      .delete(holdingsLocks)
      .where(eq(holdingsLocks.id, lockId));
  }

  async releaseSharesByReference(lockReferenceId: string): Promise<void> {
    await db
      .delete(holdingsLocks)
      .where(eq(holdingsLocks.lockReferenceId, lockReferenceId));
  }

  async getAvailableShares(userId: string, assetType: string, assetId: string): Promise<number> {
    const holding = await this.getHolding(userId, assetType, assetId);
    if (!holding) return 0;
    
    const lockedQuantity = await this.getTotalLockedQuantity(userId, assetType, assetId);
    return Math.max(0, holding.quantity - lockedQuantity);
  }

  async getLockedShares(userId: string, assetType: string, assetId: string): Promise<HoldingsLock[]> {
    return await db
      .select()
      .from(holdingsLocks)
      .where(
        and(
          eq(holdingsLocks.userId, userId),
          eq(holdingsLocks.assetType, assetType),
          eq(holdingsLocks.assetId, assetId)
        )
      );
  }

  async getTotalLockedQuantity(userId: string, assetType: string, assetId: string): Promise<number> {
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${holdingsLocks.lockedQuantity}), 0)` })
      .from(holdingsLocks)
      .where(
        and(
          eq(holdingsLocks.userId, userId),
          eq(holdingsLocks.assetType, assetType),
          eq(holdingsLocks.assetId, assetId)
        )
      );
    
    return Number(result[0]?.total || 0);
  }

  async adjustLockQuantity(lockReferenceId: string, newQuantity: number): Promise<void> {
    if (newQuantity <= 0) {
      await this.releaseSharesByReference(lockReferenceId);
    } else {
      await db
        .update(holdingsLocks)
        .set({ lockedQuantity: newQuantity })
        .where(eq(holdingsLocks.lockReferenceId, lockReferenceId));
    }
  }

  // Cash lock methods - prevent double-spending balance on buy orders
  async reserveCash(
    userId: string,
    lockType: string,
    lockReferenceId: string,
    amount: string
  ): Promise<BalanceLock> {
    // CRITICAL: Use transaction with row-level lock to prevent race conditions
    return await db.transaction(async (tx) => {
      // Step 1: Lock the user row to prevent concurrent modifications
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for('update'); // SELECT ... FOR UPDATE - prevents concurrent reservations

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Step 2: Calculate available balance (total - locked)
      const totalLocked = await this.getTotalLockedBalance(userId, tx);
      const availableBalance = parseFloat(user.balance) - totalLocked;
      const requestedAmount = parseFloat(amount);

      if (availableBalance < requestedAmount) {
        throw new Error(
          `Insufficient available balance. Available: $${availableBalance.toFixed(2)}, Requested: $${requestedAmount.toFixed(2)}`
        );
      }

      // Step 3: Create the cash lock
      const [lock] = await tx
        .insert(balanceLocks)
        .values({
          userId,
          lockType,
          lockReferenceId,
          lockedAmount: amount,
        })
        .returning();

      return lock;
    });
  }

  async releaseCash(lockId: string): Promise<void> {
    await db
      .delete(balanceLocks)
      .where(eq(balanceLocks.id, lockId));
  }

  async releaseCashByReference(lockReferenceId: string): Promise<void> {
    await db
      .delete(balanceLocks)
      .where(eq(balanceLocks.lockReferenceId, lockReferenceId));
  }

  async getAvailableBalance(userId: string, tx?: any): Promise<number> {
    const dbContext = tx || db;
    const [user] = await dbContext
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user) return 0;
    
    const lockedAmount = await this.getTotalLockedBalance(userId, tx);
    return Math.max(0, parseFloat(user.balance) - lockedAmount);
  }

  async getTotalLockedBalance(userId: string, tx?: any): Promise<number> {
    const dbContext = tx || db;
    const result = await dbContext
      .select({ total: sql<number>`COALESCE(SUM(${balanceLocks.lockedAmount}), 0)` })
      .from(balanceLocks)
      .where(eq(balanceLocks.userId, userId));
    
    return Number(result[0]?.total || 0);
  }

  async adjustLockAmount(lockReferenceId: string, newAmount: string): Promise<void> {
    const amountNum = parseFloat(newAmount);
    if (amountNum <= 0) {
      await this.releaseCashByReference(lockReferenceId);
    } else {
      await db
        .update(balanceLocks)
        .set({ lockedAmount: newAmount })
        .where(eq(balanceLocks.lockReferenceId, lockReferenceId));
    }
  }

  // Order methods
  async createOrder(order: any): Promise<Order> {
    const [created] = await db
      .insert(orders)
      .values(order)
      .returning();
    return created;
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order || undefined;
  }

  async getUserOrders(userId: string, status?: string): Promise<Order[]> {
    if (status) {
      return await db
        .select()
        .from(orders)
        .where(and(eq(orders.userId, userId), eq(orders.status, status)))
        .orderBy(desc(orders.createdAt));
    }
    return await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  }

  async getOrderBook(playerId: string): Promise<{ bids: Order[]; asks: Order[] }> {
    const allOrders = await db
      .select()
      .from(orders)
      .where(and(eq(orders.playerId, playerId), eq(orders.status, "open")));
    
    const bids = allOrders
      .filter(o => o.side === "buy" && o.orderType === "limit")
      .sort((a, b) => parseFloat(b.limitPrice || "0") - parseFloat(a.limitPrice || "0"));
    
    const asks = allOrders
      .filter(o => o.side === "sell" && o.orderType === "limit")
      .sort((a, b) => parseFloat(a.limitPrice || "0") - parseFloat(b.limitPrice || "0"));
    
    return { bids, asks };
  }

  async updateOrder(orderId: string, updates: Partial<Order>): Promise<void> {
    await db
      .update(orders)
      .set(updates)
      .where(eq(orders.id, orderId));
  }

  async cancelOrder(orderId: string): Promise<void> {
    await db
      .update(orders)
      .set({ status: "cancelled" })
      .where(eq(orders.id, orderId));
    
    // Release any locked shares for this order (sell orders)
    await this.releaseSharesByReference(orderId);
    
    // Release any locked cash for this order (buy orders)
    await this.releaseCashByReference(orderId);
  }

  // Trade methods
  async createTrade(trade: any): Promise<Trade> {
    const [created] = await db
      .insert(trades)
      .values(trade)
      .returning();
    return created;
  }

  async getRecentTrades(playerId?: string, limit: number = 10): Promise<Trade[]> {
    if (playerId) {
      return await db
        .select()
        .from(trades)
        .where(eq(trades.playerId, playerId))
        .orderBy(desc(trades.executedAt))
        .limit(limit);
    }
    return await db
      .select()
      .from(trades)
      .orderBy(desc(trades.executedAt))
      .limit(limit);
  }

  async getMarketActivity(filters?: { playerId?: string; userId?: string; playerSearch?: string; limit?: number }): Promise<any[]> {
    const { playerId, userId, playerSearch, limit = 50 } = filters || {};
    
    // Create aliases for buyer and seller users
    const buyer = alias(users, "buyer");
    const seller = alias(users, "seller");
    
    // Fetch recent trades with player and user info
    // Use a larger limit to ensure we get enough rows after merging
    const fetchLimit = limit * 2;
    
    let tradesQuery = db
      .select({
        activityType: sql<string>`'trade'`,
        id: trades.id,
        playerId: trades.playerId,
        playerFirstName: players.firstName,
        playerLastName: players.lastName,
        playerTeam: players.team,
        userId: sql<string>`NULL`,
        username: sql<string>`NULL`,
        buyerId: trades.buyerId,
        buyerUsername: buyer.username,
        sellerId: trades.sellerId,
        sellerUsername: seller.username,
        side: sql<string>`NULL`,
        orderType: sql<string>`NULL`,
        quantity: trades.quantity,
        price: trades.price,
        limitPrice: sql<string>`NULL`,
        timestamp: trades.executedAt,
      })
      .from(trades)
      .innerJoin(players, eq(trades.playerId, players.id))
      .innerJoin(buyer, eq(trades.buyerId, buyer.id))
      .innerJoin(seller, eq(trades.sellerId, seller.id));
    
    // Build and apply where conditions for trades (after joins)
    const tradeConditions = [];
    if (playerId) tradeConditions.push(eq(trades.playerId, playerId));
    if (userId) tradeConditions.push(
      or(eq(trades.buyerId, userId), eq(trades.sellerId, userId))
    );
    if (playerSearch) {
      const searchPattern = `%${playerSearch}%`;
      tradeConditions.push(
        sql`(${players.firstName} ILIKE ${searchPattern} OR ${players.lastName} ILIKE ${searchPattern})`
      );
    }
    if (tradeConditions.length > 0) {
      tradesQuery = tradesQuery.where(and(...tradeConditions));
    }
    
    const recentTrades = await tradesQuery
      .orderBy(desc(trades.executedAt))
      .limit(fetchLimit);
    
    // Fetch recent orders (placed and cancelled) with player and user info
    let ordersQuery = db
      .select({
        activityType: sql<string>`CASE WHEN ${orders.status} = 'cancelled' THEN 'order_cancelled' ELSE 'order_placed' END`,
        id: orders.id,
        playerId: orders.playerId,
        playerFirstName: players.firstName,
        playerLastName: players.lastName,
        playerTeam: players.team,
        userId: orders.userId,
        username: users.username,
        buyerId: sql<string>`NULL`,
        buyerUsername: sql<string>`NULL`,
        sellerId: sql<string>`NULL`,
        sellerUsername: sql<string>`NULL`,
        side: orders.side,
        orderType: orders.orderType,
        quantity: sql<number>`GREATEST(${orders.quantity} - ${orders.filledQuantity}, 0)`,
        price: sql<string>`NULL`,
        limitPrice: orders.limitPrice,
        timestamp: orders.createdAt,
      })
      .from(orders)
      .innerJoin(players, eq(orders.playerId, players.id))
      .innerJoin(users, eq(orders.userId, users.id));
    
    // Build and apply where conditions for orders (after joins)
    const orderConditions = [];
    if (playerId) orderConditions.push(eq(orders.playerId, playerId));
    if (userId) orderConditions.push(eq(orders.userId, userId));
    if (playerSearch) {
      const searchPattern = `%${playerSearch}%`;
      orderConditions.push(
        sql`(${players.firstName} ILIKE ${searchPattern} OR ${players.lastName} ILIKE ${searchPattern})`
      );
    }
    if (orderConditions.length > 0) {
      ordersQuery = ordersQuery.where(and(...orderConditions));
    }
    
    const recentOrders = await ordersQuery
      .orderBy(desc(orders.createdAt))
      .limit(fetchLimit);
    
    // Combine, sort by timestamp, and apply the final limit
    const combined = [...recentTrades, ...recentOrders]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit); // Apply final limit after sorting
    
    return combined;
  }

  // Mining methods
  async getMining(userId: string): Promise<Mining | undefined> {
    const [miningData] = await db
      .select()
      .from(mining)
      .where(eq(mining.userId, userId));
    return miningData || undefined;
  }

  async updateMining(userId: string, updates: Partial<Mining>): Promise<void> {
    await db
      .update(mining)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(mining.userId, userId));
  }

  async getMiningSplits(userId: string): Promise<MiningSplit[]> {
    return await db
      .select()
      .from(miningSplits)
      .where(eq(miningSplits.userId, userId));
  }

  async setMiningSplits(userId: string, splits: InsertMiningSplit[]): Promise<void> {
    // Delete existing splits
    await db.delete(miningSplits).where(eq(miningSplits.userId, userId));
    
    // Insert new splits
    if (splits.length > 0) {
      await db.insert(miningSplits).values(splits);
    }
  }

  async createMiningClaim(claim: InsertMiningClaim): Promise<MiningClaim> {
    const [created] = await db
      .insert(miningClaims)
      .values(claim)
      .returning();
    return created;
  }

  // Activity methods
  async getUserActivity(userId: string, filters?: { types?: string[]; limit?: number; offset?: number }): Promise<any[]> {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    const types = filters?.types || ['mining', 'market', 'contest'];
    
    const activities: any[] = [];

    // 1. Mining claims
    if (types.includes('mining')) {
      const claims = await db
        .select({
          id: miningClaims.id,
          occurredAt: miningClaims.claimedAt,
          playerId: miningClaims.playerId,
          playerFirstName: players.firstName,
          playerLastName: players.lastName,
          playerTeam: players.team,
          sharesClaimed: miningClaims.sharesClaimed,
        })
        .from(miningClaims)
        .leftJoin(players, eq(miningClaims.playerId, players.id))
        .where(eq(miningClaims.userId, userId))
        .orderBy(desc(miningClaims.claimedAt))
        .limit(limit);
      
      claims.forEach(claim => {
        activities.push({
          id: `mining-${claim.id}`,
          userId,
          occurredAt: claim.occurredAt,
          category: 'mining',
          subtype: 'claim',
          cashDelta: '0.00',
          sharesDelta: claim.sharesClaimed,
          metadata: {
            playerId: claim.playerId,
            playerName: claim.playerId ? `${claim.playerFirstName} ${claim.playerLastName}` : 'Multiple Players',
            playerTeam: claim.playerTeam,
            sharesClaimed: claim.sharesClaimed,
          },
        });
      });
    }

    // 2. Orders (placed/cancelled)
    if (types.includes('market')) {
      const userOrders = await db
        .select({
          id: orders.id,
          occurredAt: orders.createdAt,
          playerId: orders.playerId,
          playerFirstName: players.firstName,
          playerLastName: players.lastName,
          playerTeam: players.team,
          side: orders.side,
          orderType: orders.orderType,
          quantity: orders.quantity,
          limitPrice: orders.limitPrice,
          status: orders.status,
        })
        .from(orders)
        .innerJoin(players, eq(orders.playerId, players.id))
        .where(eq(orders.userId, userId))
        .orderBy(desc(orders.createdAt))
        .limit(limit);
      
      userOrders.forEach(order => {
        activities.push({
          id: `order-${order.id}`,
          userId,
          occurredAt: order.occurredAt,
          category: 'market',
          subtype: order.status === 'cancelled' ? 'order_cancelled' : 'order_placed',
          cashDelta: '0.00', // Orders don't change cash until trades execute
          sharesDelta: 0,
          metadata: {
            playerId: order.playerId,
            playerName: `${order.playerFirstName} ${order.playerLastName}`,
            playerTeam: order.playerTeam,
            side: order.side,
            orderType: order.orderType,
            quantity: order.quantity,
            limitPrice: order.limitPrice,
            tradePrice: order.limitPrice, // For frontend display consistency
            status: order.status,
          },
        });
      });

      // 3. Trades (executed)
      const userBuyTrades = await db
        .select({
          id: trades.id,
          occurredAt: trades.executedAt,
          playerId: trades.playerId,
          playerFirstName: players.firstName,
          playerLastName: players.lastName,
          playerTeam: players.team,
          quantity: trades.quantity,
          price: trades.price,
        })
        .from(trades)
        .innerJoin(players, eq(trades.playerId, players.id))
        .where(eq(trades.buyerId, userId))
        .orderBy(desc(trades.executedAt))
        .limit(limit);
      
      userBuyTrades.forEach(trade => {
        const totalCost = parseFloat(trade.price) * trade.quantity;
        activities.push({
          id: `trade-buy-${trade.id}`,
          userId,
          occurredAt: trade.occurredAt,
          category: 'market',
          subtype: 'trade_buy',
          cashDelta: `-${totalCost.toFixed(2)}`,
          sharesDelta: trade.quantity,
          metadata: {
            playerId: trade.playerId,
            playerName: `${trade.playerFirstName} ${trade.playerLastName}`,
            playerTeam: trade.playerTeam,
            quantity: trade.quantity,
            tradePrice: trade.price,
            side: 'buy',
          },
        });
      });

      const userSellTrades = await db
        .select({
          id: trades.id,
          occurredAt: trades.executedAt,
          playerId: trades.playerId,
          playerFirstName: players.firstName,
          playerLastName: players.lastName,
          playerTeam: players.team,
          quantity: trades.quantity,
          price: trades.price,
        })
        .from(trades)
        .innerJoin(players, eq(trades.playerId, players.id))
        .where(eq(trades.sellerId, userId))
        .orderBy(desc(trades.executedAt))
        .limit(limit);
      
      userSellTrades.forEach(trade => {
        const totalRevenue = parseFloat(trade.price) * trade.quantity;
        activities.push({
          id: `trade-sell-${trade.id}`,
          userId,
          occurredAt: trade.occurredAt,
          category: 'market',
          subtype: 'trade_sell',
          cashDelta: `${totalRevenue.toFixed(2)}`,
          sharesDelta: -trade.quantity,
          metadata: {
            playerId: trade.playerId,
            playerName: `${trade.playerFirstName} ${trade.playerLastName}`,
            playerTeam: trade.playerTeam,
            quantity: trade.quantity,
            tradePrice: trade.price,
            side: 'sell',
          },
        });
      });
    }

    // 4. Contest entries (entry fee + payout)
    if (types.includes('contest')) {
      const userEntries = await db
        .select({
          id: contestEntries.id,
          contestId: contestEntries.contestId,
          contestName: contests.name,
          contestStatus: contests.status,
          entryFee: contests.entryFee,
          totalSharesEntered: contestEntries.totalSharesEntered,
          totalScore: contestEntries.totalScore,
          rank: contestEntries.rank,
          payout: contestEntries.payout,
          createdAt: contestEntries.createdAt,
        })
        .from(contestEntries)
        .innerJoin(contests, eq(contestEntries.contestId, contests.id))
        .where(eq(contestEntries.userId, userId))
        .orderBy(desc(contestEntries.createdAt))
        .limit(limit);
      
      userEntries.forEach(entry => {
        // Entry creation (fee charged)
        activities.push({
          id: `contest-entry-${entry.id}`,
          userId,
          occurredAt: entry.createdAt,
          category: 'contest',
          subtype: 'contest_entry',
          cashDelta: '0.00', // Contests use shares, not cash
          sharesDelta: 0,
          metadata: {
            contestId: entry.contestId,
            contestName: entry.contestName,
            entryFee: entry.entryFee,
            totalSharesEntered: entry.totalSharesEntered,
          },
        });

        // Contest completion (payout received) - only if contest is completed and payout > 0
        if (entry.contestStatus === 'completed' && parseFloat(entry.payout) > 0) {
          activities.push({
            id: `contest-payout-${entry.id}`,
            userId,
            occurredAt: entry.createdAt, // Use entry creation date as proxy for completion
            category: 'contest',
            subtype: 'contest_payout',
            cashDelta: `${entry.payout}`,
            sharesDelta: 0,
            metadata: {
              contestId: entry.contestId,
              contestName: entry.contestName,
              rank: entry.rank,
              payout: entry.payout,
              totalScore: entry.totalScore,
            },
          });
        }
      });
    }

    // Sort all activities by timestamp (most recent first) and apply pagination
    const sorted = activities.sort((a, b) => 
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );

    // Get current user balance for balance-after calculations
    const user = await this.getUser(userId);
    if (!user) return [];
    
    let currentBalance = parseFloat(user.balance);
    
    // Process activities from most recent to oldest, adding descriptions and balance-after
    const enrichedActivities = sorted.slice(offset, offset + limit).map((activity: any) => {
      const cashDelta = activity.cashDelta ? parseFloat(activity.cashDelta) : 0;
      const balanceAfter = currentBalance;
      
      // Move backwards through history (we're going DESC)
      currentBalance -= cashDelta;
      
      // Build description
      let description = '';
      const meta = activity.metadata;
      
      if (activity.category === 'mining') {
        description = `Claimed ${meta.sharesClaimed} shares${meta.playerName ? ` of ${meta.playerName}` : ''}`;
      } else if (activity.category === 'market') {
        if (activity.subtype === 'trade_buy') {
          description = `Bought ${meta.quantity} shares of ${meta.playerName} @ $${meta.tradePrice}`;
        } else if (activity.subtype === 'trade_sell') {
          description = `Sold ${meta.quantity} shares of ${meta.playerName} @ $${meta.tradePrice}`;
        } else if (activity.subtype === 'order_placed') {
          if (meta.orderType === 'limit') {
            description = `${meta.side === 'buy' ? 'Buy' : 'Sell'} limit order: ${meta.quantity} shares of ${meta.playerName} @ $${meta.limitPrice}`;
          } else {
            description = `${meta.side === 'buy' ? 'Buy' : 'Sell'} market order: ${meta.quantity} shares of ${meta.playerName}`;
          }
        } else if (activity.subtype === 'order_cancelled') {
          description = `Cancelled ${meta.side} order for ${meta.quantity} shares of ${meta.playerName}`;
        }
      } else if (activity.category === 'contest') {
        if (activity.subtype === 'contest_entry') {
          description = `Entered ${meta.contestName}`;
        } else if (activity.subtype === 'contest_payout') {
          description = `${meta.contestName} - Rank ${meta.rank} Payout`;
        }
      }
      
      return {
        id: activity.id,
        timestamp: activity.occurredAt,
        category: activity.category,
        type: activity.subtype,
        description,
        cashDelta: cashDelta !== 0 ? activity.cashDelta : undefined,
        shareDelta: activity.sharesDelta || undefined,
        balanceAfter: balanceAfter.toFixed(2),
        metadata: meta,
      };
    });

    return enrichedActivities;
  }

  // Contest methods
  async getContests(status?: string): Promise<Contest[]> {
    if (status) {
      return await db
        .select()
        .from(contests)
        .where(eq(contests.status, status))
        .orderBy(desc(contests.startsAt));
    }
    return await db
      .select()
      .from(contests)
      .orderBy(desc(contests.startsAt));
  }

  async getContest(id: string): Promise<Contest | undefined> {
    const [contest] = await db.select().from(contests).where(eq(contests.id, id));
    return contest || undefined;
  }

  async createContest(contest: InsertContest): Promise<Contest> {
    const [created] = await db
      .insert(contests)
      .values(contest)
      .returning();
    return created;
  }

  async createContestEntry(entry: InsertContestEntry): Promise<ContestEntry> {
    const [created] = await db
      .insert(contestEntries)
      .values(entry)
      .returning();
    return created;
  }

  async getContestEntries(contestId: string): Promise<ContestEntry[]> {
    return await db
      .select()
      .from(contestEntries)
      .where(eq(contestEntries.contestId, contestId))
      .orderBy(asc(contestEntries.rank));
  }

  async getUserContestEntries(userId: string): Promise<ContestEntry[]> {
    return await db
      .select()
      .from(contestEntries)
      .where(eq(contestEntries.userId, userId))
      .orderBy(desc(contestEntries.createdAt));
  }

  async createContestLineup(lineup: InsertContestLineup): Promise<void> {
    await db.insert(contestLineups).values(lineup);
  }

  async updateContestEntry(entryId: string, updates: Partial<ContestEntry>): Promise<void> {
    await db
      .update(contestEntries)
      .set(updates)
      .where(eq(contestEntries.id, entryId));
  }

  async updateContest(contestId: string, updates: Partial<Contest>): Promise<void> {
    await db
      .update(contests)
      .set(updates)
      .where(eq(contests.id, contestId));
  }

  async getContestLineups(entryId: string): Promise<any[]> {
    return await db
      .select()
      .from(contestLineups)
      .where(eq(contestLineups.entryId, entryId));
  }

  async updateContestLineup(lineupId: string, updates: any): Promise<void> {
    await db
      .update(contestLineups)
      .set(updates)
      .where(eq(contestLineups.id, lineupId));
  }

  async updateContestMetrics(contestId: string, totalShares: number, entryFee: string): Promise<void> {
    // Fetch current contest to calculate new values
    const [current] = await db
      .select()
      .from(contests)
      .where(eq(contests.id, contestId));
    
    if (!current) return;

    // Calculate new values
    const newEntryCount = current.entryCount + 1;
    const newTotalShares = current.totalSharesEntered + totalShares;
    // Prize pool equals total shares (1 share = $1)
    const newPrizePool = newTotalShares;

    // Update with calculated values
    await db
      .update(contests)
      .set({
        entryCount: newEntryCount,
        totalSharesEntered: newTotalShares,
        totalPrizePool: newPrizePool.toFixed(2),
      })
      .where(eq(contests.id, contestId));
  }

  async getContestEntryWithLineup(entryId: string, userId: string): Promise<{ entry: ContestEntry; lineup: any[] } | null> {
    const [entry] = await db
      .select()
      .from(contestEntries)
      .where(and(eq(contestEntries.id, entryId), eq(contestEntries.userId, userId)));
    
    if (!entry) return null;

    const lineup = await this.getContestLineups(entryId);
    return { entry, lineup };
  }

  async deleteContestLineup(entryId: string): Promise<void> {
    await db
      .delete(contestLineups)
      .where(eq(contestLineups.entryId, entryId));
  }

  async getContestEntryDetail(contestId: string, entryId: string): Promise<any> {
    // Get the entry with user information
    const [entry] = await db
      .select({
        id: contestEntries.id,
        contestId: contestEntries.contestId,
        userId: contestEntries.userId,
        username: users.username,
        totalSharesEntered: contestEntries.totalSharesEntered,
        totalScore: contestEntries.totalScore,
        rank: contestEntries.rank,
        payout: contestEntries.payout,
        createdAt: contestEntries.createdAt,
      })
      .from(contestEntries)
      .innerJoin(users, eq(contestEntries.userId, users.id))
      .where(and(
        eq(contestEntries.id, entryId),
        eq(contestEntries.contestId, contestId)
      ));

    if (!entry) {
      return null;
    }

    // Get contest details for entry fee
    const contest = await this.getContest(contestId);
    if (!contest) {
      return null;
    }

    // Only show lineups after contest locks (status is "live" or "completed")
    // Before that, return empty lineup to hide other users' entries
    let lineupWithPercentages: any[] = [];
    
    if (contest.status === "live" || contest.status === "completed") {
      // Get the lineup with player details
      const lineup = await db
        .select({
          id: contestLineups.id,
          playerId: contestLineups.playerId,
          playerFirstName: players.firstName,
          playerLastName: players.lastName,
          playerTeam: players.team,
          playerPosition: players.position,
          sharesEntered: contestLineups.sharesEntered,
          fantasyPoints: contestLineups.fantasyPoints,
          earnedScore: contestLineups.earnedScore,
        })
        .from(contestLineups)
        .innerJoin(players, eq(contestLineups.playerId, players.id))
        .where(eq(contestLineups.entryId, entryId));

      // For each player, calculate percentage of total shares entered for that player in this contest
      lineupWithPercentages = await Promise.all(
        lineup.map(async (lineupItem) => {
          // Sum all shares entered for this player across all entries in the contest
          const [totalSharesResult] = await db
            .select({
              totalShares: sql<number>`CAST(COALESCE(SUM(${contestLineups.sharesEntered}), 0) AS INTEGER)`,
            })
            .from(contestLineups)
            .leftJoin(contestEntries, eq(contestLineups.entryId, contestEntries.id))
            .where(and(
              eq(contestEntries.contestId, contestId),
              eq(contestLineups.playerId, lineupItem.playerId)
            ));

          const totalPlayerShares = totalSharesResult?.totalShares || 0;
          const percentage = totalPlayerShares > 0 
            ? ((lineupItem.sharesEntered / totalPlayerShares) * 100).toFixed(2)
            : "0.00";

          return {
            ...lineupItem,
            totalPlayerSharesInContest: totalPlayerShares,
            ownershipPercentage: percentage,
          };
        })
      );
    }

    // Net winnings equals payout (no entry fees in this system)
    const payout = parseFloat(entry.payout);

    return {
      entry: {
        ...entry,
        netWinnings: payout.toFixed(2),
      },
      lineup: lineupWithPercentages,
      contest: {
        id: contest.id,
        name: contest.name,
        status: contest.status,
        totalPrizePool: contest.totalPrizePool,
      },
    };
  }

  // Daily games methods
  async upsertDailyGame(game: InsertDailyGame): Promise<DailyGame> {
    const [existing] = await db
      .select()
      .from(dailyGames)
      .where(eq(dailyGames.gameId, game.gameId));

    if (existing) {
      const [updated] = await db
        .update(dailyGames)
        .set({ ...game, lastFetchedAt: new Date() })
        .where(eq(dailyGames.gameId, game.gameId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(dailyGames)
        .values(game)
        .returning();
      return created;
    }
  }

  async getDailyGames(startDate: Date, endDate: Date): Promise<DailyGame[]> {
    return await db
      .select()
      .from(dailyGames)
      .where(
        and(
          sql`${dailyGames.date} >= ${startDate}`,
          sql`${dailyGames.date} <= ${endDate}`
        )
      )
      .orderBy(asc(dailyGames.startTime));
  }

  async updateDailyGameStatus(gameId: string, status: string): Promise<void> {
    await db
      .update(dailyGames)
      .set({ status, lastFetchedAt: new Date() })
      .where(eq(dailyGames.gameId, gameId));
  }

  async getGamesByTeam(teamAbbreviation: string, startDate: Date, endDate: Date): Promise<DailyGame[]> {
    return await db
      .select()
      .from(dailyGames)
      .where(
        and(
          sql`${dailyGames.date} >= ${startDate}`,
          sql`${dailyGames.date} <= ${endDate}`,
          sql`(${dailyGames.homeTeam} = ${teamAbbreviation} OR ${dailyGames.awayTeam} = ${teamAbbreviation})`
        )
      )
      .orderBy(asc(dailyGames.startTime));
  }

  // Job execution log methods
  async createJobLog(log: InsertJobExecutionLog): Promise<JobExecutionLog> {
    const [created] = await db
      .insert(jobExecutionLogs)
      .values(log)
      .returning();
    return created;
  }

  async updateJobLog(id: string, updates: Partial<JobExecutionLog>): Promise<void> {
    await db
      .update(jobExecutionLogs)
      .set(updates)
      .where(eq(jobExecutionLogs.id, id));
  }

  async getRecentJobLogs(jobName?: string, limit: number = 50): Promise<JobExecutionLog[]> {
    let query = db.select().from(jobExecutionLogs);
    
    if (jobName) {
      query = query.where(eq(jobExecutionLogs.jobName, jobName));
    }
    
    return await query
      .orderBy(desc(jobExecutionLogs.scheduledFor))
      .limit(limit);
  }

  // Player game stats methods
  async upsertPlayerGameStats(stats: InsertPlayerGameStats): Promise<PlayerGameStats> {
    const [existing] = await db
      .select()
      .from(playerGameStats)
      .where(
        and(
          eq(playerGameStats.playerId, stats.playerId),
          eq(playerGameStats.gameId, stats.gameId)
        )
      );

    if (existing) {
      const [updated] = await db
        .update(playerGameStats)
        .set({ ...stats, lastFetchedAt: new Date() })
        .where(eq(playerGameStats.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(playerGameStats)
        .values(stats)
        .returning();
      return created;
    }
  }

  async getPlayerGameStats(playerId: string, gameId: string): Promise<PlayerGameStats | undefined> {
    const [stats] = await db
      .select()
      .from(playerGameStats)
      .where(
        and(
          eq(playerGameStats.playerId, playerId),
          eq(playerGameStats.gameId, gameId)
        )
      );
    return stats || undefined;
  }

  async getAllPlayerGameStats(playerId: string): Promise<PlayerGameStats[]> {
    return await db
      .select()
      .from(playerGameStats)
      .where(eq(playerGameStats.playerId, playerId))
      .orderBy(desc(playerGameStats.gameDate));
  }

  async getGameStatsByGameId(gameId: string): Promise<PlayerGameStats[]> {
    return await db
      .select()
      .from(playerGameStats)
      .where(eq(playerGameStats.gameId, gameId));
  }

  // Player season summaries methods (persistent stats caching)
  async upsertPlayerSeasonSummary(summary: InsertPlayerSeasonSummary): Promise<PlayerSeasonSummary> {
    const season = summary.season || "2024-2025-regular";
    const [existing] = await db
      .select()
      .from(playerSeasonSummaries)
      .where(
        and(
          eq(playerSeasonSummaries.playerId, summary.playerId),
          eq(playerSeasonSummaries.season, season)
        )
      );

    if (existing) {
      const [updated] = await db
        .update(playerSeasonSummaries)
        .set({
          ...summary,
          updatedAt: new Date(),
        })
        .where(eq(playerSeasonSummaries.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(playerSeasonSummaries)
        .values({
          ...summary,
          season,
        })
        .returning();
      return created;
    }
  }

  async getPlayerSeasonSummary(playerId: string, season: string = "2024-2025-regular"): Promise<PlayerSeasonSummary | undefined> {
    const [summary] = await db
      .select()
      .from(playerSeasonSummaries)
      .where(
        and(
          eq(playerSeasonSummaries.playerId, playerId),
          eq(playerSeasonSummaries.season, season)
        )
      );
    return summary || undefined;
  }

  async getAllPlayerSeasonSummaries(season: string = "2024-2025-regular"): Promise<PlayerSeasonSummary[]> {
    return await db
      .select()
      .from(playerSeasonSummaries)
      .where(eq(playerSeasonSummaries.season, season))
      .orderBy(desc(playerSeasonSummaries.fantasyPointsPerGame));
  }
}

export const storage = new DatabaseStorage();
