import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { storage } from "./storage";
import { db } from "./db";
import { fetchActivePlayers, calculateFantasyPoints } from "./mysportsfeeds";
import type { InsertPlayer, Player, User, Holding } from "@shared/schema";
import { contestLineups, contestEntries, contests, holdings, marketSnapshots } from "@shared/schema";
import { sql, eq, desc, and, gte, lte } from "drizzle-orm";
import { jobScheduler } from "./jobs/scheduler";
import { addClient, removeClient, broadcast } from "./websocket";
import { calculateAccrualUpdate } from "@shared/vesting-utils";
import { createContests } from "./jobs/create-contests";
import { calculateContestLeaderboard } from "./contest-scoring";
import { setupAuth, isAuthenticated, optionalAuth } from "./replitAuth";
import { getGameDay, getETDayBoundaries, getTodayETBoundaries } from "./lib/time";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  await setupAuth(app);

  const httpServer = createServer(app);

  // Initialize WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    addClient(ws);
    ws.on('close', () => removeClient(ws));
  });

  // Helper: Get authenticated user ID from session
  const getUserId = (req: any): string => {
    if (!req.user?.claims?.sub) {
      throw new Error("User not authenticated");
    }
    return req.user.claims.sub;
  };

  // Helper: Enrich player data with last trade price (market value)
  // Now just returns the cached lastTradePrice from database - no additional queries needed
  function enrichPlayerWithMarketValue(player: Player): Player & { lastTradePrice: string | null } {
    return {
      ...player,
      lastTradePrice: player.lastTradePrice || null, // Cached value from database
    };
  }

  // Helper: Calculate P&L for holdings - returns null values if no market price exists
  function calculatePnL(quantity: number, avgCost: string, lastTradePrice: string | null) {
    // If no market price exists (no trades), return null values
    if (!lastTradePrice) {
      return {
        currentValue: null,
        pnl: null,
        pnlPercent: null,
      };
    }
    
    const cost = parseFloat(avgCost);
    const price = parseFloat(lastTradePrice);
    const totalValue = quantity * price;
    const totalCost = quantity * cost;
    const pnl = totalValue - totalCost;
    const pnlPercent = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
    
    return {
      currentValue: totalValue.toFixed(2),
      pnl: pnl.toFixed(2),
      pnlPercent: pnlPercent.toFixed(2),
    };
  }

  // Helper: Accrue vesting shares based on elapsed time
  async function accrueVestingShares(userId: string) {
    const user = await storage.getUser(userId);
    if (!user) return;

    const miningData = await storage.getMining(userId);
    if (!miningData) return;
    
    // Check if using multi-player vesting (splits)
    const splits = await storage.getMiningSplits(userId);
    const usingSplits = splits.length > 0;
    
    // If using splits but no splits configured, or using single player but no player selected, return
    if (!usingSplits && !miningData.playerId) return;

    const now = new Date();
    // Force non-premium rates for demo user (100 shares/hour total, 2400 cap)
    const capLimit = 2400;
    const totalSharesPerHour = 100;

    // If already at cap, don't accrue more - clear residual time
    if (miningData.sharesAccumulated >= capLimit) {
      if (!miningData.capReachedAt || miningData.residualMs !== 0) {
        await storage.updateMining(userId, { 
          capReachedAt: now,
          residualMs: 0,
          updatedAt: now,
        });
      }
      return;
    }

    // Initialize lastAccruedAt if missing (fallback to updatedAt or now)
    const effectiveLastAccruedAt = miningData.lastAccruedAt || miningData.updatedAt || now;
    
    // If we had to initialize, update the database immediately
    if (!miningData.lastAccruedAt) {
      await storage.updateMining(userId, {
        lastAccruedAt: effectiveLastAccruedAt,
        updatedAt: now,
      });
    }

    // Use shared utility to calculate accrual update
    const update = calculateAccrualUpdate({
      sharesAccumulated: miningData.sharesAccumulated,
      residualMs: miningData.residualMs || 0,
      lastAccruedAt: effectiveLastAccruedAt,
      sharesPerHour: totalSharesPerHour,
      capLimit,
    }, now);

    // Only update if shares were actually earned
    const sharesEarned = update.sharesAccumulated - miningData.sharesAccumulated;
    if (sharesEarned > 0) {
      await storage.updateMining(userId, {
        sharesAccumulated: update.sharesAccumulated,
        residualMs: update.residualMs,
        lastAccruedAt: update.lastAccruedAt,
        updatedAt: now,
        capReachedAt: update.capReached ? now : null,
      });
    }
    // If no shares earned yet, DON'T update anything - leave baseline unchanged
  }

  // Helper: Match orders (FIFO) - Only for limit orders
  async function matchOrders(playerId: string) {
    const orderBook = await storage.getOrderBook(playerId);
    const player = await storage.getPlayer(playerId);
    
    if (!player) return;

    // Match buy and sell limit orders
    for (const buyOrder of orderBook.bids) {
      if (buyOrder.status !== "open" || buyOrder.filledQuantity >= buyOrder.quantity) continue;
      if (!buyOrder.limitPrice) continue; // Skip if no limit price (shouldn't happen for limit orders)

      for (const sellOrder of orderBook.asks) {
        if (sellOrder.status !== "open" || sellOrder.filledQuantity >= sellOrder.quantity) continue;
        if (!sellOrder.limitPrice) continue; // Skip if no limit price (shouldn't happen for limit orders)

        // Check if prices match
        const buyPrice = parseFloat(buyOrder.limitPrice);
        const sellPrice = parseFloat(sellOrder.limitPrice);
        
        if (buyPrice >= sellPrice) {
          // Execute trade
          const remainingBuy = buyOrder.quantity - buyOrder.filledQuantity;
          const remainingSell = sellOrder.quantity - sellOrder.filledQuantity;
          const tradeQuantity = Math.min(remainingBuy, remainingSell);
          const tradePrice = sellPrice; // Price-time priority

          // Create trade record
          await storage.createTrade({
            playerId,
            buyerId: buyOrder.userId,
            sellerId: sellOrder.userId,
            buyOrderId: buyOrder.id,
            sellOrderId: sellOrder.id,
            quantity: tradeQuantity,
            price: tradePrice.toFixed(2),
          });

          // Update orders
          const newBuyFilled = buyOrder.filledQuantity + tradeQuantity;
          const newSellFilled = sellOrder.filledQuantity + tradeQuantity;

          await storage.updateOrder(buyOrder.id, {
            filledQuantity: newBuyFilled,
            status: newBuyFilled >= buyOrder.quantity ? "filled" : "partial",
          });

          await storage.updateOrder(sellOrder.id, {
            filledQuantity: newSellFilled,
            status: newSellFilled >= sellOrder.quantity ? "filled" : "partial",
          });

          // Adjust locked resources
          // Adjust locked shares for the sell order
          const remainingSellLocked = sellOrder.quantity - newSellFilled;
          await storage.adjustLockQuantity(sellOrder.id, remainingSellLocked);
          
          // Adjust locked cash for the buy order
          const remainingBuyQuantity = buyOrder.quantity - newBuyFilled;
          const buyLimitPrice = parseFloat(buyOrder.limitPrice || "0");
          const remainingBuyLocked = (remainingBuyQuantity * buyLimitPrice).toFixed(2);
          await storage.adjustLockAmount(buyOrder.id, remainingBuyLocked);

          // Update holdings for buyer (Average Cost Method)
          const buyerHolding = await storage.getHolding(buyOrder.userId, "player", playerId);
          if (buyerHolding) {
            const newQuantity = buyerHolding.quantity + tradeQuantity;
            const newTotalCost = parseFloat(buyerHolding.totalCostBasis) + (tradeQuantity * tradePrice);
            const newAvgCost = newTotalCost / newQuantity;
            await storage.updateHolding(buyOrder.userId, "player", playerId, newQuantity, newAvgCost.toFixed(4));
          } else {
            await storage.updateHolding(buyOrder.userId, "player", playerId, tradeQuantity, tradePrice.toFixed(4));
          }

          // Update holdings for seller
          const sellerHolding = await storage.getHolding(sellOrder.userId, "player", playerId);
          if (sellerHolding) {
            const newQuantity = sellerHolding.quantity - tradeQuantity;
            await storage.updateHolding(sellOrder.userId, "player", playerId, newQuantity, sellerHolding.avgCostBasis);
          }

          // Update balances
          const buyer = await storage.getUser(buyOrder.userId);
          const seller = await storage.getUser(sellOrder.userId);
          
          if (buyer && seller) {
            const tradeCost = tradeQuantity * tradePrice;
            await storage.updateUserBalance(buyOrder.userId, (parseFloat(buyer.balance) - tradeCost).toFixed(2));
            await storage.updateUserBalance(sellOrder.userId, (parseFloat(seller.balance) + tradeCost).toFixed(2));
          }

          // Update player price and cache last trade price
          await storage.upsertPlayer({
            ...player,
            currentPrice: tradePrice.toFixed(2),
            lastTradePrice: tradePrice.toFixed(2), // Cache for performance
            volume24h: player.volume24h + tradeQuantity,
          });

          // Broadcast updates after each match iteration
          broadcast({
            type: "trade",
            playerId,
            price: tradePrice.toFixed(2),
            quantity: tradeQuantity,
          });
          
          broadcast({ type: "orderBook", playerId }); // Update order book depth in real-time
          broadcast({ type: "marketActivity" }); // Trigger activity feed refresh
          
          // Broadcast portfolio updates for both parties
          const updatedBuyer = await storage.getUser(buyOrder.userId);
          const updatedSeller = await storage.getUser(sellOrder.userId);
          if (updatedBuyer) {
            broadcast({ type: "portfolio", userId: buyOrder.userId, balance: updatedBuyer.balance });
          }
          if (updatedSeller) {
            broadcast({ type: "portfolio", userId: sellOrder.userId, balance: updatedSeller.balance });
          }
        }
      }
    }
  }

  // SEO: Dynamic Sitemap XML
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const baseUrl = "https://sportfolio.replit.app";
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Fetch limited dynamic content for performance
      const [topPlayersByVolume, activeContests, blogPosts] = await Promise.all([
        storage.getTopPlayersByVolume(200), // Top 200 players only
        storage.getContests(), // Active contests
        storage.getBlogPosts({ limit: 100, offset: 0, publishedOnly: true }),
      ]);

      // Static pages with realistic lastmod dates
      const staticPages = [
        { url: "", lastmod: today, changefreq: "daily", priority: "1.0" },
        { url: "marketplace", lastmod: today, changefreq: "hourly", priority: "0.9" },
        { url: "contests", lastmod: today, changefreq: "daily", priority: "0.9" },
        { url: "leaderboards", lastmod: today, changefreq: "daily", priority: "0.8" },
        { url: "blog", lastmod: today, changefreq: "weekly", priority: "0.8" },
        { url: "how-it-works", lastmod: "2025-11-23", changefreq: "monthly", priority: "0.7" },
        { url: "about", lastmod: "2025-11-23", changefreq: "monthly", priority: "0.6" },
        { url: "contact", lastmod: "2025-11-23", changefreq: "monthly", priority: "0.6" },
        { url: "privacy", lastmod: "2025-11-23", changefreq: "yearly", priority: "0.4" },
        { url: "terms", lastmod: "2025-11-23", changefreq: "yearly", priority: "0.4" },
      ];

      // Build sitemap XML
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

      // Add static pages
      staticPages.forEach(page => {
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/${page.url}</loc>\n`;
        xml += `    <lastmod>${page.lastmod}</lastmod>\n`;
        xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
        xml += `    <priority>${page.priority}</priority>\n`;
        xml += `  </url>\n`;
      });

      // Add player pages (already sorted by volume from storage)
      topPlayersByVolume.forEach((player: Player) => {
        const playerLastMod = player.lastUpdated ? new Date(player.lastUpdated).toISOString().split('T')[0] : today;
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/player/${player.id}</loc>\n`;
        xml += `    <lastmod>${playerLastMod}</lastmod>\n`;
        xml += `    <changefreq>daily</changefreq>\n`;
        xml += `    <priority>0.7</priority>\n`;
        xml += `  </url>\n`;
      });

      // Add contest detail and leaderboard pages
      activeContests.forEach((contest: typeof activeContests[0]) => {
        // Main contest detail page
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/contest/${contest.id}</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += `    <changefreq>hourly</changefreq>\n`;
        xml += `    <priority>0.6</priority>\n`;
        xml += `  </url>\n`;
        
        // Contest leaderboard page
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/contest/${contest.id}/leaderboard</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += `    <changefreq>hourly</changefreq>\n`;
        xml += `    <priority>0.6</priority>\n`;
        xml += `  </url>\n`;
      });

      // Add blog posts with actual update dates
      blogPosts.posts.forEach((post: typeof blogPosts.posts[0]) => {
        const postLastMod = post.updatedAt || post.publishedAt;
        const formattedDate = new Date(postLastMod).toISOString().split('T')[0];
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/blog/${post.slug}</loc>\n`;
        xml += `    <lastmod>${formattedDate}</lastmod>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.7</priority>\n`;
        xml += `  </url>\n`;
      });

      xml += '</urlset>';

      res.header('Content-Type', 'application/xml');
      res.send(xml);
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).send("Error generating sitemap");
    }
  });

  // API ROUTES

  // Auth endpoints
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Dashboard - Now public for unauthenticated users (with limited data)
  app.get("/api/dashboard", optionalAuth, async (req, res) => {
    try {
      // Check if user is authenticated
      const isUserAuthenticated = !!req.user;
      const userId = isUserAuthenticated ? getUserId(req) : null;
      
      // Fetch public data (always available)
      const [allContests, recentTrades, hotPlayersRaw] = await Promise.all([
        storage.getContests("open"),
        storage.getRecentTrades(undefined, 10),
        storage.getTopPlayersByVolume(5), // Get top 5 players by 24h volume directly from DB
      ]);
      
      // If not authenticated, return public data only
      if (!isUserAuthenticated || !userId) {
        // Collect player IDs from public data
        const playerIds = new Set<string>();
        recentTrades.forEach(t => playerIds.add(t.playerId));
        
        // Batch fetch needed players
        const players = await storage.getPlayersByIds(Array.from(playerIds));
        const playerMap = new Map(players.map(p => [p.id, p]));
        
        // Enrich hot players
        const hotPlayers = await Promise.all(hotPlayersRaw.map(enrichPlayerWithMarketValue));
        
        return res.json({
          user: null, // No user data for anonymous visitors
          hotPlayers,
          vesting: null,
          contests: allContests.slice(0, 5),
          recentTrades: recentTrades.map(trade => ({
            ...trade,
            player: playerMap.get(trade.playerId),
          })),
          topHoldings: [],
          portfolioHistory: [],
        });
      }
      
      // Authenticated user - fetch full dashboard data
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Accrue mining shares based on elapsed time
      await accrueVestingShares(user.id);
      
      // Fetch user-specific data in parallel
      const [userHoldings, miningData, miningSplits] = await Promise.all([
        storage.getUserHoldings(user.id),
        storage.getMining(user.id),
        storage.getMiningSplits(user.id),
      ]);

      // Collect all unique player IDs we need to fetch
      const playerIds = new Set<string>();
      
      // Add holdings player IDs
      userHoldings.forEach(h => {
        if (h.assetType === "player") playerIds.add(h.assetId);
      });
      
      // Add recent trades player IDs
      recentTrades.forEach(t => playerIds.add(t.playerId));
      
      // Add mining player IDs
      if (miningData?.playerId) playerIds.add(miningData.playerId);
      miningSplits.forEach(s => playerIds.add(s.playerId));
      
      // Batch fetch all needed players in one query
      const players = await storage.getPlayersByIds(Array.from(playerIds));
      const playerMap = new Map(players.map(p => [p.id, p]));

      // Calculate portfolio value using pre-fetched players
      // Only count holdings with real market prices (skip placeholder prices)
      let portfolioValue = 0;
      for (const holding of userHoldings) {
        if (holding.assetType === "player") {
          const player = playerMap.get(holding.assetId);
          if (player && player.lastTradePrice) {
            portfolioValue += holding.quantity * parseFloat(player.lastTradePrice);
          }
        }
      }

      // Enrich hot players with market values
      const hotPlayers = await Promise.all(hotPlayersRaw.map(enrichPlayerWithMarketValue));

      // Get top 3 holdings by value using pre-fetched players
      const topHoldings = [];
      for (const holding of userHoldings) {
        if (holding.assetType === "player") {
          const player = playerMap.get(holding.assetId);
          if (player) {
            const enrichedPlayer = enrichPlayerWithMarketValue(player);
            const { currentValue, pnl, pnlPercent } = calculatePnL(
              holding.quantity,
              holding.avgCostBasis,
              enrichedPlayer.lastTradePrice
            );
            topHoldings.push({
              player: enrichedPlayer,
              quantity: holding.quantity,
              value: currentValue,
              pnl,
              pnlPercent,
            });
          }
        }
      }
      // Sort by value, putting null values at the end
      topHoldings.sort((a, b) => {
        if (a.value === null && b.value === null) return 0;
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return parseFloat(b.value) - parseFloat(a.value);
      });

      // Get mining data using pre-fetched players
      let miningPlayer = undefined;
      let miningPlayers: Array<{ player: Player | undefined; sharesPerHour: number }> = [];
      
      if (miningSplits.length > 0) {
        // Multi-player mining
        miningPlayers = miningSplits.map(split => ({
          player: playerMap.get(split.playerId),
          sharesPerHour: split.sharesPerHour,
        }));
      } else if (miningData?.playerId) {
        // Legacy single-player mining
        miningPlayer = playerMap.get(miningData.playerId);
      }

      // Try to get ranks from latest snapshot for performance
      const latestRanks = await storage.getLatestSnapshotRanks();
      const cachedRank = latestRanks.get(user.id);
      
      let currentCashRank = cachedRank?.cashRank || 1;
      let currentPortfolioRank = cachedRank?.portfolioRank || 1;
      
      // If no cached ranks, fallback to real-time calculation
      if (!cachedRank) {
        const allUsersRankData = await storage.getAllUsersForRanking();
        
        const cashSorted = [...allUsersRankData].sort((a, b) => 
          parseFloat(b.balance) - parseFloat(a.balance)
        );
        currentCashRank = cashSorted.findIndex(u => u.userId === user.id) + 1;
        
        const portfolioSorted = [...allUsersRankData].sort((a, b) => 
          b.portfolioValue - a.portfolioValue
        );
        currentPortfolioRank = portfolioSorted.findIndex(u => u.userId === user.id) + 1;
      }
      
      // Get yesterday's snapshot to calculate rank changes
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const yesterdaySnapshot = await storage.getPortfolioSnapshot(user.id, yesterday);
      
      const cashRankChange = yesterdaySnapshot?.cashRank 
        ? yesterdaySnapshot.cashRank - currentCashRank 
        : null;
      const portfolioRankChange = yesterdaySnapshot?.portfolioRank 
        ? yesterdaySnapshot.portfolioRank - currentPortfolioRank 
        : null;

      res.json({
        user: {
          balance: user.balance,
          portfolioValue: portfolioValue.toFixed(2),
          cashRank: currentCashRank,
          portfolioRank: currentPortfolioRank,
          cashRankChange,
          portfolioRankChange,
        },
        hotPlayers,
        vesting: miningData ? {
          ...miningData,
          player: miningPlayer,
          players: miningPlayers,
          capLimit: 2400,
          sharesPerHour: 100,
        } : null,
        contests: allContests.slice(0, 5),
        recentTrades: recentTrades.map(trade => ({
          ...trade,
          player: playerMap.get(trade.playerId),
        })),
        topHoldings: topHoldings.slice(0, 3),
        portfolioHistory: [], // Placeholder
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Today's games (in ET timezone where NBA games are scheduled)
  app.get("/api/games/today", async (req, res) => {
    try {
      const { startOfDay, endOfDay } = getTodayETBoundaries();
      const games = await storage.getDailyGames(startOfDay, endOfDay);
      
      // Add gameDay to each game for frontend display
      const gamesWithDay = games.map(game => ({
        ...game,
        gameDay: getGameDay(game.startTime),
      }));
      
      res.json(gamesWithDay);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Games for a specific date (YYYY-MM-DD format in Eastern Time)
  app.get("/api/games/date/:date", async (req, res) => {
    try {
      const { date } = req.params;
      
      // Validate date format (YYYY-MM-DD)
      const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!dateMatch) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
      }
      
      const { startOfDay, endOfDay } = getETDayBoundaries(date);
      const games = await storage.getDailyGames(startOfDay, endOfDay);
      
      // Add gameDay to each game for frontend display
      const gamesWithDay = games.map(game => ({
        ...game,
        gameDay: getGameDay(game.startTime),
      }));
      
      res.json(gamesWithDay);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Game stats - get player box scores for a specific game
  app.get("/api/games/:gameId/stats", async (req, res) => {
    try {
      const { gameId } = req.params;
      const gameIdNum = parseInt(gameId);
      
      if (isNaN(gameIdNum)) {
        return res.status(400).json({ error: "Invalid game ID" });
      }
      
      // Get all player stats for this game
      const stats = await storage.getGameStatsByGameId(gameId);
      
      if (!stats || stats.length === 0) {
        return res.json({
          gameId,
          homeTeam: { players: [], totals: null },
          awayTeam: { players: [], totals: null },
          topPerformers: null,
          message: "No stats available yet"
        });
      }

      // Get player details for all stats
      const statsWithPlayers = await Promise.all(
        stats.map(async (stat) => {
          const player = await storage.getPlayer(stat.playerId);
          return {
            playerId: stat.playerId,
            playerName: player ? `${player.firstName} ${player.lastName}` : 'Unknown',
            team: player?.team || stat.opponentTeam,
            minutes: stat.minutes,
            points: stat.points,
            threePointersMade: stat.threePointersMade,
            rebounds: stat.rebounds,
            assists: stat.assists,
            steals: stat.steals,
            blocks: stat.blocks,
            turnovers: stat.turnovers,
            fantasyPoints: parseFloat(stat.fantasyPoints),
            homeAway: stat.homeAway,
          };
        })
      );

      // Group by home/away
      const homeStats = statsWithPlayers.filter(s => s.homeAway === "home");
      const awayStats = statsWithPlayers.filter(s => s.homeAway === "away");
      
      const calculateTeamTotals = (teamStats: typeof statsWithPlayers) => ({
        points: teamStats.reduce((sum, s) => sum + s.points, 0),
        rebounds: teamStats.reduce((sum, s) => sum + s.rebounds, 0),
        assists: teamStats.reduce((sum, s) => sum + s.assists, 0),
        steals: teamStats.reduce((sum, s) => sum + s.steals, 0),
        blocks: teamStats.reduce((sum, s) => sum + s.blocks, 0),
        turnovers: teamStats.reduce((sum, s) => sum + s.turnovers, 0),
      });

      // Find top performers across both teams
      const allStats = [...homeStats, ...awayStats];
      const topScorer = allStats.reduce((max, s) => s.points > max.points ? s : max, allStats[0]);
      const topRebounder = allStats.reduce((max, s) => s.rebounds > max.rebounds ? s : max, allStats[0]);
      const topAssister = allStats.reduce((max, s) => s.assists > max.assists ? s : max, allStats[0]);

      res.json({
        gameId,
        homeTeam: {
          players: homeStats,
          totals: homeStats.length > 0 ? calculateTeamTotals(homeStats) : null,
        },
        awayTeam: {
          players: awayStats,
          totals: awayStats.length > 0 ? calculateTeamTotals(awayStats) : null,
        },
        topPerformers: allStats.length > 0 ? {
          topScorer,
          topRebounder,
          topAssister,
        } : null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add cash to user balance ($1)
  app.post("/api/user/add-cash", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const updatedUser = await storage.addUserBalance(user.id, 1.00);
      
      if (updatedUser) {
        broadcast({ type: "portfolio", userId: user.id, balance: updatedUser.balance });
        res.json({ balance: updatedUser.balance });
      } else {
        res.status(500).json({ error: "Failed to update balance" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update username
  app.post("/api/user/update-username", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { username } = req.body;

      // Validate username
      if (!username || typeof username !== 'string') {
        return res.status(400).json({ error: "Username is required" });
      }

      // Check length (3-20 characters)
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: "Username must be between 3 and 20 characters" });
      }

      // Check format (alphanumeric, underscores, hyphens only)
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return res.status(400).json({ error: "Username can only contain letters, numbers, underscores, and hyphens" });
      }

      // Check if username is already taken by another user
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser && existingUser.id !== userId) {
        return res.status(409).json({ error: "Username is already taken" });
      }

      const updatedUser = await storage.updateUsername(userId, username);
      if (updatedUser) {
        res.json({ username: updatedUser.username });
      } else {
        res.status(500).json({ error: "Failed to update username" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark onboarding as complete
  app.post("/api/user/onboarding/complete", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.markOnboardingComplete(userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint to manually trigger sync jobs
  app.post("/api/admin/sync/:jobName", isAuthenticated, async (req, res) => {
    try {
      const { jobName } = req.params;
      const result = await jobScheduler.triggerJob(jobName);
      res.json({
        success: true,
        jobName,
        ...result,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Players / Marketplace
  app.get("/api/teams", async (req, res) => {
    try {
      const teams = await storage.getDistinctTeams();
      res.json(teams);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/players", async (req, res) => {
    try {
      const { search, team, position, limit, offset, sortBy, sortOrder, hasBuyOrders, hasSellOrders, teamsPlayingOnDate } = req.query;
      
      // Parse and validate pagination params
      const parsedLimit = limit ? parseInt(limit as string) : 50;
      const parsedOffset = offset ? parseInt(offset as string) : 0;
      
      // Guard against invalid numeric input (NaN)
      const safeLimit = isNaN(parsedLimit) ? 50 : Math.max(1, Math.min(parsedLimit, 200));
      const safeOffset = isNaN(parsedOffset) ? 0 : Math.max(0, parsedOffset);
      
      // Parse sorting and filter params
      const validSortBy = ['price', 'volume', 'change', 'bid', 'ask'];
      const safeSortBy = sortBy && validSortBy.includes(sortBy as string) 
        ? sortBy as 'price' | 'volume' | 'change' | 'bid' | 'ask'
        : 'volume';
      const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
      const safeHasBuyOrders = hasBuyOrders === 'true';
      const safeHasSellOrders = hasSellOrders === 'true';
      
      // Handle teams playing on date filter
      let teamsPlayingFilter: string[] | undefined = undefined;
      if (teamsPlayingOnDate && typeof teamsPlayingOnDate === 'string') {
        // Parse the date string (expected format: YYYY-MM-DD)
        const dateMatch = (teamsPlayingOnDate as string).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateMatch) {
          const [, year, month, day] = dateMatch;
          const etOffset = -5; // ET is UTC-5 (EST) or UTC-4 (EDT), using -5 for simplicity
          
          // Create date in ET timezone
          const startOfDayET = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0);
          const endOfDayET = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 23, 59, 59);
          
          // Convert ET boundaries to UTC for database query
          const startOfDayUTC = new Date(startOfDayET.getTime() - (etOffset * 60 * 60 * 1000));
          const endOfDayUTC = new Date(endOfDayET.getTime() - (etOffset * 60 * 60 * 1000));
          
          // Fetch games for that date
          const games = await storage.getDailyGames(startOfDayUTC, endOfDayUTC);
          
          // Extract unique team codes
          const teamsSet = new Set<string>();
          games.forEach(game => {
            teamsSet.add(game.homeTeam);
            teamsSet.add(game.awayTeam);
          });
          teamsPlayingFilter = Array.from(teamsSet);
        }
      }
      
      const { players: playersRaw, total } = await storage.getPlayersPaginated({
        search: search as string,
        team: team as string,
        position: position as string,
        limit: safeLimit,
        offset: safeOffset,
        sortBy: safeSortBy,
        sortOrder: safeSortOrder,
        hasBuyOrders: safeHasBuyOrders,
        hasSellOrders: safeHasSellOrders,
        teamsPlayingOnDate: teamsPlayingFilter,
      });
      
      // PERFORMANCE OPTIMIZATION: Batch fetch order books and season stats for ALL players in parallel
      // This eliminates N+1 query problems:
      // - 50 players × 2 order book queries = 100 queries → 1 query
      // - 50 players × 1 season stats query = 50 queries → 1 query
      const playerIds = playersRaw.map(p => p.id);
      const [orderBooksMap, seasonStatsMap] = await Promise.all([
        storage.getBatchOrderBooks(playerIds),
        storage.getBatchPlayerSeasonStatsFromLogs(playerIds),
      ]);
      
      // Enrich with market values, order book data, and fantasy points average (only for paginated results)
      const players = playersRaw.map((player) => {
        const enriched = enrichPlayerWithMarketValue(player);
        
        // Look up pre-fetched order book data from map (no additional query!)
        const orderBookData = orderBooksMap.get(player.id) || {
          bids: [],
          asks: [],
          bestBid: null,
          bestAsk: null,
          bidSize: 0,
          askSize: 0,
        };
        
        // Look up pre-fetched season stats from map (no additional query!)
        const seasonStats = seasonStatsMap.get(player.id) || {
          gamesPlayed: 0,
          avgFantasyPointsPerGame: "0.0",
        };
        
        return {
          ...enriched,
          bestBid: orderBookData.bestBid,
          bestAsk: orderBookData.bestAsk,
          bidSize: orderBookData.bidSize,
          askSize: orderBookData.askSize,
          avgFantasyPointsPerGame: seasonStats.avgFantasyPointsPerGame,
        };
      });
      
      res.json({ players, total });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Market activity feed
  app.get("/api/market/activity", async (req, res) => {
    try {
      const { playerId, userId, playerSearch, limit } = req.query;
      
      const parsedLimit = limit ? parseInt(limit as string) : 50;
      const safeLimit = isNaN(parsedLimit) ? 50 : Math.max(1, Math.min(parsedLimit, 200));
      
      const activity = await storage.getMarketActivity({
        playerId: playerId as string,
        userId: userId as string,
        playerSearch: playerSearch as string,
        limit: safeLimit,
      });
      
      res.json(activity);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Player detail page
  app.get("/api/player/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const playerRaw = await storage.getPlayer(req.params.id);
      
      if (!playerRaw) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Enrich with market value
      const player = await enrichPlayerWithMarketValue(playerRaw);
      
      const orderBook = await storage.getOrderBook(player.id);
      const recentTrades = await storage.getRecentTrades(player.id, 20);
      const userHolding = await storage.getHolding(user.id, "player", player.id);

      // Price history: empty array if no trades, flat line at last trade price if trades exist
      const priceHistory = player.lastTradePrice
        ? Array.from({ length: 24 }, (_, i) => ({
            timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
            price: player.lastTradePrice,
          }))
        : [];

      // Calculate available balance (excluding locked cash for buy orders)
      const availableBalance = await storage.getAvailableBalance(user.id);

      res.json({
        player,
        priceHistory,
        orderBook: {
          bids: orderBook.bids.slice(0, 10).map(o => ({
            price: o.limitPrice,
            quantity: o.quantity - o.filledQuantity,
          })),
          asks: orderBook.asks.slice(0, 10).map(o => ({
            price: o.limitPrice,
            quantity: o.quantity - o.filledQuantity,
          })),
        },
        recentTrades: await Promise.all(
          recentTrades.map(async (trade) => ({
            ...trade,
            buyer: await storage.getUser(trade.buyerId),
            seller: await storage.getUser(trade.sellerId),
          }))
        ),
        userBalance: availableBalance.toFixed(2),
        userHolding,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Player season stats (PPG, RPG, APG, etc.)
  app.get("/api/player/:id/stats", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Fetch season stats from cached game logs (no API call)
      const seasonStats = await storage.getPlayerSeasonStatsFromLogs(player.id);
      
      if (!seasonStats) {
        return res.json({ 
          player: { firstName: player.firstName, lastName: player.lastName },
          team: { abbreviation: player.team },
          stats: null 
        });
      }

      res.json({
        player: { firstName: player.firstName, lastName: player.lastName },
        team: { abbreviation: player.team },
        stats: {
          gamesPlayed: seasonStats.gamesPlayed,
          // Fantasy scoring
          avgFantasyPointsPerGame: seasonStats.avgFantasyPointsPerGame,
          // Scoring
          points: Math.round(parseFloat(seasonStats.pointsPerGame) * seasonStats.gamesPlayed),
          pointsPerGame: seasonStats.pointsPerGame,
          fieldGoalPct: seasonStats.fieldGoalPct,
          threePointPct: seasonStats.threePointPct,
          freeThrowPct: seasonStats.freeThrowPct,
          // Rebounding
          rebounds: Math.round(parseFloat(seasonStats.reboundsPerGame) * seasonStats.gamesPlayed),
          reboundsPerGame: seasonStats.reboundsPerGame,
          offensiveRebounds: 0, // Not tracked in simplified cache
          defensiveRebounds: 0, // Not tracked in simplified cache
          // Playmaking
          assists: Math.round(parseFloat(seasonStats.assistsPerGame) * seasonStats.gamesPlayed),
          assistsPerGame: seasonStats.assistsPerGame,
          turnovers: 0, // Not tracked in summary
          // Defense
          steals: seasonStats.steals,
          blocks: seasonStats.blocks,
          // Minutes
          minutes: Math.round(parseFloat(seasonStats.minutesPerGame) * seasonStats.gamesPlayed),
          minutesPerGame: seasonStats.minutesPerGame,
        },
      });
    } catch (error: any) {
      console.error("[API] Error fetching player stats:", error.message);
      // Return graceful fallback instead of 500 error
      res.json({ 
        stats: null,
        error: "Stats temporarily unavailable"
      });
    }
  });

  // Player recent games (last 10 games)
  app.get("/api/player/:id/recent-games", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Fetch last 10 games from cached game logs (no API call)
      const recentGames = await storage.getPlayerRecentGamesFromLogs(player.id, 10);
      
      res.json({ recentGames });
    } catch (error: any) {
      console.error("[API] Error fetching player game logs:", error.message);
      // Return graceful fallback instead of 500 error
      res.json({ 
        recentGames: [],
        error: "Game logs temporarily unavailable"
      });
    }
  });

  // Player contest earnings and performance
  app.get("/api/player/:id/contest-earnings", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Query contest lineups for this player across all completed contests
      const playerContestLineups = await db
        .select({
          contestId: contests.id,
          entryId: contestLineups.entryId,
          sharesEntered: contestLineups.sharesEntered,
          fantasyPoints: contestLineups.fantasyPoints,
          earnedScore: contestLineups.earnedScore,
          contestName: contests.name,
          contestDate: contests.gameDate,
          contestStatus: contests.status,
          entryRank: contestEntries.rank,
          entryPayout: contestEntries.payout,
          totalEntries: contests.entryCount,
        })
        .from(contestLineups)
        .innerJoin(contestEntries, eq(contestLineups.entryId, contestEntries.id))
        .innerJoin(contests, eq(contestEntries.contestId, contests.id))
        .where(eq(contestLineups.playerId, player.id))
        .orderBy(desc(contests.gameDate));

      // Calculate aggregate stats
      const totalAppearances = playerContestLineups.length;
      const completedContests = playerContestLineups.filter((c: any) => c.contestStatus === 'completed');
      
      // Calculate total earnings (sum of payouts from entries where this player was used)
      // Note: This counts the full entry payout, which might include other players
      const totalEarnings = completedContests.reduce((sum: number, c: any) => {
        return sum + parseFloat(c.entryPayout || "0");
      }, 0);

      // Calculate average fantasy points from contest performances
      const avgFantasyPoints = completedContests.length > 0
        ? completedContests.reduce((sum: number, c: any) => sum + parseFloat(c.fantasyPoints || "0"), 0) / completedContests.length
        : 0;

      // Calculate win rate (entries that finished in the top 50%)
      const winningEntries = completedContests.filter((c: any) => {
        if (!c.entryRank || !c.totalEntries) return false;
        return c.entryRank <= Math.ceil(c.totalEntries / 2);
      });
      const winRate = completedContests.length > 0 
        ? (winningEntries.length / completedContests.length) * 100 
        : 0;

      res.json({
        player: {
          id: player.id,
          firstName: player.firstName,
          lastName: player.lastName,
        },
        contestPerformance: {
          totalAppearances,
          completedContests: completedContests.length,
          totalEarnings: totalEarnings.toFixed(2),
          avgFantasyPoints: avgFantasyPoints.toFixed(2),
          winRate: winRate.toFixed(1),
        },
        recentContests: playerContestLineups.slice(0, 10).map((c: any) => ({
          contestName: c.contestName,
          contestDate: c.contestDate,
          status: c.contestStatus,
          fantasyPoints: c.fantasyPoints,
          earnedScore: c.earnedScore,
          sharesEntered: c.sharesEntered,
          entryRank: c.entryRank,
          entryPayout: c.entryPayout,
        })),
      });
    } catch (error: any) {
      console.error("[API] Error fetching contest earnings:", error.message);
      res.json({ 
        contestPerformance: null,
        recentContests: [],
        error: "Contest data temporarily unavailable"
      });
    }
  });

  // Player shares info (total shares outstanding and market cap)
  app.get("/api/player/:id/shares-info", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Calculate total shares outstanding across all users
      const totalSharesResult = await db
        .select({ total: sql<number>`COALESCE(SUM(${holdings.quantity}), 0)` })
        .from(holdings)
        .where(
          and(
            eq(holdings.assetType, "player"),
            eq(holdings.assetId, player.id)
          )
        );

      const totalShares = Number(totalSharesResult[0]?.total || 0);

      // Use ONLY last trade price - never fall back to placeholder currentPrice
      // If no trades have occurred, price and market cap are null
      const sharePrice = player.lastTradePrice ? parseFloat(player.lastTradePrice) : null;
      const marketCap = sharePrice !== null ? totalShares * sharePrice : null;

      // Get number of unique holders
      const holdersResult = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${holdings.userId})` })
        .from(holdings)
        .where(
          and(
            eq(holdings.assetType, "player"),
            eq(holdings.assetId, player.id),
            sql`${holdings.quantity} > 0`
          )
        );

      const totalHolders = Number(holdersResult[0]?.count || 0);

      res.json({
        player: {
          id: player.id,
          firstName: player.firstName,
          lastName: player.lastName,
          team: player.team,
        },
        sharesInfo: {
          totalSharesOutstanding: totalShares,
          currentSharePrice: sharePrice !== null ? sharePrice.toFixed(2) : null,
          marketCap: marketCap !== null ? marketCap.toFixed(2) : null,
          totalHolders,
          volume24h: player.volume24h,
          priceChange24h: player.priceChange24h,
        },
      });
    } catch (error: any) {
      console.error("[API] Error fetching shares info:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Place order
  app.post("/api/orders/:playerId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const player = await storage.getPlayer(req.params.playerId);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const { orderType, side, quantity, limitPrice } = req.body;

      // Validation
      if (!quantity || quantity <= 0) {
        return res.status(400).json({ error: "Invalid quantity" });
      }

      if (orderType === "limit" && (!limitPrice || parseFloat(limitPrice) <= 0)) {
        return res.status(400).json({ error: "Invalid limit price" });
      }

      // Check available balance for buy orders (total - locked)
      if (side === "buy") {
        let price: number;
        
        if (orderType === "limit") {
          price = parseFloat(limitPrice);
        } else {
          // For market orders, get price from best ask (use worst-case for balance check)
          const orderBook = await storage.getOrderBook(req.params.playerId);
          const validAsks = orderBook.asks.filter(o => 
            o.limitPrice && 
            parseFloat(o.limitPrice) > 0 && 
            (o.quantity - o.filledQuantity) > 0
          );
          
          if (validAsks.length === 0) {
            return res.status(400).json({ error: "No market liquidity available" });
          }
          
          // Use highest ask price for balance check (worst case)
          price = Math.max(...validAsks.map(o => parseFloat(o.limitPrice!)));
        }
        
        const cost = quantity * price;
        const availableBalance = await storage.getAvailableBalance(user.id);
        
        if (availableBalance < cost) {
          return res.status(400).json({ error: `Insufficient available balance. Available: $${availableBalance.toFixed(2)}, Required: $${cost.toFixed(2)}` });
        }
      }

      // Check holdings for sell orders - verify available (unlocked) shares
      if (side === "sell") {
        const availableShares = await storage.getAvailableShares(user.id, "player", req.params.playerId);
        if (availableShares < quantity) {
          return res.status(400).json({ error: "Insufficient available shares (some may be locked in orders or contests)" });
        }
      }

      // For market orders, validate liquidity BEFORE creating the order
      if (orderType === "market") {
        const orderBook = await storage.getOrderBook(req.params.playerId);
        const availableOrders = side === "buy" ? orderBook.asks : orderBook.bids;
        
        // Check if there are any valid counter-side orders with valid prices
        const validOrders = availableOrders.filter(o => 
          o.limitPrice && 
          parseFloat(o.limitPrice) > 0 && 
          (o.quantity - o.filledQuantity) > 0
        );
        
        if (validOrders.length === 0) {
          return res.status(400).json({ error: "No liquidity available for market order at valid prices" });
        }
      }

      // Create order
      const order = await storage.createOrder({
        userId: user.id,
        playerId: req.params.playerId,
        orderType,
        side,
        quantity,
        limitPrice: orderType === "limit" ? limitPrice : null,
      });

      // Lock resources to prevent double-spending
      if (side === "sell") {
        // Lock shares for sell orders
        await storage.reserveShares(
          user.id,
          "player",
          req.params.playerId,
          "order",
          order.id,
          quantity
        );
      } else if (side === "buy") {
        // Lock cash for buy orders
        const lockPrice = orderType === "limit" ? parseFloat(limitPrice) : await (async () => {
          const orderBook = await storage.getOrderBook(req.params.playerId);
          const validAsks = orderBook.asks.filter(o => 
            o.limitPrice && 
            parseFloat(o.limitPrice) > 0 && 
            (o.quantity - o.filledQuantity) > 0
          );
          return Math.max(...validAsks.map(o => parseFloat(o.limitPrice!)));
        })();
        
        const lockAmount = (quantity * lockPrice).toFixed(2);
        await storage.reserveCash(user.id, "order", order.id, lockAmount);
      }

      // Broadcast order placed
      broadcast({ type: "marketActivity" });

      // For market orders, match immediately
      if (orderType === "market") {
        const orderBook = await storage.getOrderBook(req.params.playerId);
        const availableOrders = side === "buy" ? orderBook.asks : orderBook.bids;
        
        let remainingQty = quantity;
        let totalCost = 0;
        let lastFillPrice = 0; // Track last fill price for broadcast

        for (const availableOrder of availableOrders) {
          if (remainingQty <= 0) break;
          
          // Ensure the counterparty order has a valid limit price
          if (!availableOrder.limitPrice || parseFloat(availableOrder.limitPrice) <= 0) {
            continue; // Skip invalid orders
          }
          
          const availableQty = availableOrder.quantity - availableOrder.filledQuantity;
          const fillQty = Math.min(remainingQty, availableQty);
          const fillPrice = parseFloat(availableOrder.limitPrice);
          lastFillPrice = fillPrice; // Track for broadcast

          // Execute trade
          await storage.createTrade({
            playerId: req.params.playerId,
            buyerId: side === "buy" ? user.id : availableOrder.userId,
            sellerId: side === "sell" ? user.id : availableOrder.userId,
            buyOrderId: side === "buy" ? order.id : availableOrder.id,
            sellOrderId: side === "sell" ? order.id : availableOrder.id,
            quantity: fillQty,
            price: fillPrice.toFixed(2),
          });

          remainingQty -= fillQty;
          totalCost += fillQty * fillPrice;

          // Update matched order
          const newFilled = availableOrder.filledQuantity + fillQty;
          await storage.updateOrder(availableOrder.id, {
            filledQuantity: newFilled,
            status: newFilled >= availableOrder.quantity ? "filled" : "partial",
          });

          // Adjust locked resources for the matched order
          if (availableOrder.side === "sell") {
            // Adjust locked shares for sell orders
            const remainingLocked = availableOrder.quantity - newFilled;
            await storage.adjustLockQuantity(availableOrder.id, remainingLocked);
          } else {
            // Adjust locked cash for buy orders
            const remainingLocked = availableOrder.quantity - newFilled;
            const orderPrice = parseFloat(availableOrder.limitPrice || "0");
            const remainingCashLocked = (remainingLocked * orderPrice).toFixed(2);
            await storage.adjustLockAmount(availableOrder.id, remainingCashLocked);
          }

          // Update holdings
          if (side === "buy") {
            const buyerHolding = await storage.getHolding(user.id, "player", req.params.playerId);
            if (buyerHolding) {
              const newQuantity = buyerHolding.quantity + fillQty;
              const newTotalCost = parseFloat(buyerHolding.totalCostBasis) + (fillQty * fillPrice);
              const newAvgCost = newTotalCost / newQuantity;
              await storage.updateHolding(user.id, "player", req.params.playerId, newQuantity, newAvgCost.toFixed(4));
            } else {
              await storage.updateHolding(user.id, "player", req.params.playerId, fillQty, fillPrice.toFixed(4));
            }

            const sellerHolding = await storage.getHolding(availableOrder.userId, "player", req.params.playerId);
            if (sellerHolding) {
              await storage.updateHolding(
                availableOrder.userId,
                "player",
                req.params.playerId,
                sellerHolding.quantity - fillQty,
                sellerHolding.avgCostBasis
              );
            }
          } else {
            // Sell order
            const buyerHolding = await storage.getHolding(availableOrder.userId, "player", req.params.playerId);
            if (buyerHolding) {
              const newQuantity = buyerHolding.quantity + fillQty;
              const newTotalCost = parseFloat(buyerHolding.totalCostBasis) + (fillQty * fillPrice);
              const newAvgCost = newTotalCost / newQuantity;
              await storage.updateHolding(
                availableOrder.userId,
                "player",
                req.params.playerId,
                newQuantity,
                newAvgCost.toFixed(4)
              );
            } else {
              await storage.updateHolding(availableOrder.userId, "player", req.params.playerId, fillQty, fillPrice.toFixed(4));
            }

            const sellerHolding = await storage.getHolding(user.id, "player", req.params.playerId);
            if (sellerHolding) {
              await storage.updateHolding(user.id, "player", req.params.playerId, sellerHolding.quantity - fillQty, sellerHolding.avgCostBasis);
            }
          }

          // Update balances
          const seller = await storage.getUser(side === "sell" ? user.id : availableOrder.userId);
          const buyer = await storage.getUser(side === "buy" ? user.id : availableOrder.userId);
          
          if (buyer && seller) {
            const tradeCost = fillQty * fillPrice;
            await storage.updateUserBalance(buyer.id, (parseFloat(buyer.balance) - tradeCost).toFixed(2));
            await storage.updateUserBalance(seller.id, (parseFloat(seller.balance) + tradeCost).toFixed(2));
            
            // Broadcast portfolio updates for BOTH parties in each fill
            const updatedBuyer = await storage.getUser(buyer.id);
            const updatedSeller = await storage.getUser(seller.id);
            if (updatedBuyer) {
              broadcast({ type: "portfolio", userId: buyer.id, balance: updatedBuyer.balance });
            }
            if (updatedSeller) {
              broadcast({ type: "portfolio", userId: seller.id, balance: updatedSeller.balance });
            }
          }
        }

        // Update market order status
        const filledQty = quantity - remainingQty;
        
        // Safety check: If no fills occurred despite passing pre-check, cancel the order
        if (filledQty === 0) {
          await storage.updateOrder(order.id, { status: "cancelled" });
          broadcast({ type: "orderBook", playerId: req.params.playerId });
          return res.status(400).json({ error: "Market order could not be filled - order cancelled" });
        }
        
        await storage.updateOrder(order.id, {
          filledQuantity: filledQty,
          status: remainingQty === 0 ? "filled" : "partial",
        });

        // Adjust locked resources for the placed market order
        if (side === "sell") {
          // Adjust locked shares for sell market orders
          await storage.adjustLockQuantity(order.id, remainingQty);
        } else {
          // Adjust locked cash for buy market orders
          // For market orders, we need to release excess locked cash since actual cost may be less
          // The actual cost is totalCost, so we can release the difference
          await storage.releaseCashByReference(order.id);
        }

        // Broadcast real-time updates for order book and trades
        // Calculate VWAP (volume-weighted average price) for the market order
        const vwap = filledQty > 0 ? (totalCost / filledQty).toFixed(2) : lastFillPrice.toFixed(2);
        
        broadcast({ type: "orderBook", playerId: req.params.playerId });
        broadcast({ type: "trade", playerId: req.params.playerId, quantity: filledQty, price: vwap });
        // Note: portfolio broadcasts already sent for each party in the fill loop above
      } else {
        // Limit order - try to match
        await matchOrders(req.params.playerId);
        broadcast({ type: "orderBook", playerId: req.params.playerId });
      }

      res.json({ success: true, order });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Cancel order
  app.post("/api/orders/:orderId/cancel", isAuthenticated, async (req, res) => {
    try {
      await storage.cancelOrder(req.params.orderId);
      broadcast({ type: "marketActivity" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Portfolio
  app.get("/api/portfolio", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Optimized: Single JOIN query to get holdings + players + locks
      const holdingsWithData = await storage.getUserHoldingsWithPlayers(user.id);
      const openOrders = await storage.getUserOrders(user.id, "open");

      let totalValue = 0;
      let totalPnL = 0;
      let totalCost = 0;

      // Batch fetch all players for orders in one query
      const orderPlayerIds = openOrders.map(o => o.playerId);
      const orderPlayers = orderPlayerIds.length > 0 
        ? await storage.getPlayersByIds(orderPlayerIds)
        : [];
      const orderPlayersMap = new Map(orderPlayers.map(p => [p.id, p]));

      const enrichedHoldings = holdingsWithData.map((item: any) => {
        const holding = item.holding;
        const player = item.player;
        const lockedQuantity = Number(item.totalLocked || 0);

        if (holding.assetType === "player" && player) {
          // Use real market price only - never fall back to placeholder currentPrice
          const { currentValue, pnl, pnlPercent } = calculatePnL(
            holding.quantity,
            holding.avgCostBasis,
            player.lastTradePrice
          );
          
          if (currentValue !== null) {
            totalValue += parseFloat(currentValue);
            totalPnL += parseFloat(pnl!);
            totalCost += parseFloat(holding.totalCostBasis);
          }

          return { 
            ...holding, 
            player, 
            currentValue, 
            pnl, 
            pnlPercent,
            lockedQuantity,
            availableQuantity: Math.max(0, holding.quantity - lockedQuantity)
          };
        }
        return holding;
      });

      const enrichedOrders = openOrders.map((order) => ({
        ...order,
        player: orderPlayersMap.get(order.playerId),
      }));

      const premiumShares = holdingsWithData.find((item: any) => item.holding.assetType === "premium")?.holding.quantity || 0;

      res.json({
        balance: user.balance,
        portfolioValue: totalValue.toFixed(2),
        totalPnL: totalPnL.toFixed(2),
        totalPnLPercent: totalCost > 0 ? ((totalPnL / totalCost) * 100).toFixed(2) : "0.00",
        holdings: enrichedHoldings,
        openOrders: enrichedOrders,
        premiumShares,
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Activity feed - user transactions and activity timeline
  app.get("/api/activity", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { types, limit, offset } = req.query;
      
      // Parse types filter (comma-separated string to array)
      let typesArray: string[] | undefined;
      if (types && typeof types === 'string') {
        typesArray = types.split(',').filter(t => ['mining', 'market', 'contest'].includes(t));
      }

      const filters = {
        types: typesArray,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      };

      const activities = await storage.getUserActivity(userId, filters);

      res.json({
        activities,
        total: activities.length,
        limit: filters.limit,
        offset: filters.offset,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Start/select vesting for player(s)
  app.post("/api/vesting/start", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { playerIds } = req.body; // Array of player IDs (1-10)

      if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
        return res.status(400).json({ error: "playerIds array required (1-10 players)" });
      }

      if (playerIds.length > 10) {
        return res.status(400).json({ error: "Maximum 10 players allowed" });
      }

      // PERFORMANCE OPTIMIZATION: Batch fetch all players in ONE query instead of N queries
      const playersArray = await storage.getPlayersByIds(playerIds);
      
      // Validate all players exist and are eligible
      if (playersArray.length !== playerIds.length) {
        const foundIds = new Set(playersArray.map(p => p.id));
        const missingId = playerIds.find(id => !foundIds.has(id));
        return res.status(404).json({ error: `Player ${missingId} not found` });
      }
      
      for (const player of playersArray) {
        if (!player.isEligibleForMining) {
          return res.status(400).json({ error: `${player.firstName} ${player.lastName} is not eligible for vesting` });
        }
      }
      
      const players = playersArray;

      // AUTO-CLAIM: Check if user has unclaimed shares and claim them automatically
      await accrueVestingShares(user.id);
      const currentMining = await storage.getMining(user.id);
      let claimedData = null;

      if (currentMining && currentMining.sharesAccumulated > 0) {
        const totalAccumulated = currentMining.sharesAccumulated;
        const splits = await storage.getMiningSplits(user.id);
        const usingSplits = splits.length > 0;

        if (usingSplits) {
          // Multi-player vesting: distribute shares proportionally
          const totalRate = 100;
          const claimedPlayers = [];
          let totalDistributed = 0;

          const distributions = splits.map(split => {
            const proportion = split.sharesPerHour / totalRate;
            const shares = Math.floor(proportion * totalAccumulated);
            return { ...split, shares };
          });

          // Distribute remainder deterministically
          const remainder = totalAccumulated - distributions.reduce((sum, d) => sum + d.shares, 0);
          const sortedByRate = [...distributions].sort((a, b) => b.sharesPerHour - a.sharesPerHour);
          for (let i = 0; i < remainder; i++) {
            sortedByRate[i].shares += 1;
          }

          // PERFORMANCE OPTIMIZATION: Batch fetch players and holdings in parallel
          const playerIdsForClaim = distributions.filter(d => d.shares > 0).map(d => d.playerId);
          const [claimPlayers, claimHoldings] = await Promise.all([
            storage.getPlayersByIds(playerIdsForClaim),
            storage.getBatchHoldings(user.id, "player", playerIdsForClaim),
          ]);
          
          // Create lookup maps for fast access
          const playersMap = new Map(claimPlayers.map(p => [p.id, p]));

          // Add shares to holdings for each player
          for (const dist of distributions) {
            if (dist.shares === 0) continue;

            const player = playersMap.get(dist.playerId);
            if (!player) continue;

            const holding = claimHoldings.get(dist.playerId);
            if (holding) {
              const newQuantity = holding.quantity + dist.shares;
              const newTotalCost = parseFloat(holding.totalCostBasis);
              const newAvgCost = newTotalCost / newQuantity;
              await storage.updateHolding(user.id, "player", dist.playerId, newQuantity, newAvgCost.toFixed(4));
            } else {
              await storage.updateHolding(user.id, "player", dist.playerId, dist.shares, "0.0000");
            }

            await storage.createMiningClaim({
              userId: user.id,
              playerId: dist.playerId,
              sharesClaimed: dist.shares,
            });

            claimedPlayers.push({
              playerId: dist.playerId,
              playerName: `${player.firstName} ${player.lastName}`,
              sharesClaimed: dist.shares,
            });
            totalDistributed += dist.shares;
          }

          await storage.incrementTotalSharesMined(user.id, totalDistributed);
          claimedData = { players: claimedPlayers, totalSharesClaimed: totalDistributed };
        } else {
          // Legacy single-player mining - use batched queries for consistency
          if (currentMining.playerId) {
            const [players, holdings] = await Promise.all([
              storage.getPlayersByIds([currentMining.playerId]),
              storage.getBatchHoldings(user.id, "player", [currentMining.playerId]),
            ]);
            
            const player = players[0];
            if (player) {
              const holding = holdings.get(currentMining.playerId);
              if (holding) {
                const newQuantity = holding.quantity + currentMining.sharesAccumulated;
                const newTotalCost = parseFloat(holding.totalCostBasis);
                const newAvgCost = newTotalCost / newQuantity;
                await storage.updateHolding(user.id, "player", currentMining.playerId, newQuantity, newAvgCost.toFixed(4));
              } else {
                await storage.updateHolding(user.id, "player", currentMining.playerId, currentMining.sharesAccumulated, "0.0000");
              }

              await storage.incrementTotalSharesMined(user.id, currentMining.sharesAccumulated);
              await storage.createMiningClaim({
                userId: user.id,
                playerId: currentMining.playerId,
                sharesClaimed: currentMining.sharesAccumulated,
              });

              claimedData = { 
                sharesClaimed: currentMining.sharesAccumulated,
                player,
              };
            }
          }
        }

        broadcast({ type: "portfolio", userId: user.id });
        broadcast({ type: "vesting", userId: user.id, claimed: totalAccumulated });
      }

      // Calculate shares per hour for each player (equal distribution)
      const totalRate = 100;
      const baseSharesPerHour = Math.floor(totalRate / playerIds.length);
      const remainder = totalRate % playerIds.length;

      // Create new splits
      const newSplits = playerIds.map((playerId, index) => ({
        userId: user.id,
        playerId,
        // Distribute remainder to first N players
        sharesPerHour: baseSharesPerHour + (index < remainder ? 1 : 0),
      }));

      // Update mining state: clear playerId (using splits now), reset timestamps
      const now = new Date();
      await storage.setMiningSplits(user.id, newSplits);
      await storage.updateMining(user.id, {
        playerId: null, // Clear single player ID since using splits
        sharesAccumulated: 0,
        residualMs: 0,
        lastAccruedAt: now,
        lastClaimedAt: null,
        capReachedAt: null,
        updatedAt: now,
      });

      broadcast({ type: "vesting", userId: user.id, playerIds });

      res.json({ 
        success: true, 
        players, 
        splits: newSplits,
        claimed: claimedData, // Include auto-claim data if shares were claimed
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vesting claim
  app.post("/api/vesting/claim", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Accrue any final shares before claiming
      await accrueVestingShares(user.id);
      
      const miningData = await storage.getMining(user.id);

      if (!miningData || miningData.sharesAccumulated === 0) {
        return res.status(400).json({ error: "No shares to claim" });
      }

      // Check if using multi-player vesting (splits)
      const splits = await storage.getMiningSplits(user.id);
      const usingSplits = splits.length > 0;

      if (!usingSplits) {
        // Legacy single-player mining - use batched queries for consistency
        if (!miningData.playerId) {
          return res.status(400).json({ error: "No player selected for vesting" });
        }

        const [players, holdings] = await Promise.all([
          storage.getPlayersByIds([miningData.playerId]),
          storage.getBatchHoldings(user.id, "player", [miningData.playerId]),
        ]);
        
        const player = players[0];
        if (!player) {
          return res.status(400).json({ error: "Player not found" });
        }

        // Add shares to holdings (cost basis $0)
        const holding = holdings.get(miningData.playerId);
        if (holding) {
          const newQuantity = holding.quantity + miningData.sharesAccumulated;
          const newTotalCost = parseFloat(holding.totalCostBasis); // Mined shares have $0 cost
          const newAvgCost = newTotalCost / newQuantity;
          await storage.updateHolding(user.id, "player", miningData.playerId, newQuantity, newAvgCost.toFixed(4));
        } else {
          await storage.updateHolding(user.id, "player", miningData.playerId, miningData.sharesAccumulated, "0.0000");
        }

        // Increment total shares mined counter
        await storage.incrementTotalSharesMined(user.id, miningData.sharesAccumulated);

        // Record mining claim for activity timeline
        await storage.createMiningClaim({
          userId: user.id,
          playerId: miningData.playerId,
          sharesClaimed: miningData.sharesAccumulated,
        });

        // Reset mining
        const now = new Date();
        await storage.updateMining(user.id, {
          sharesAccumulated: 0,
          lastClaimedAt: now,
          lastAccruedAt: now,
          updatedAt: now,
          residualMs: 0,
          capReachedAt: null,
        });

        broadcast({ type: "portfolio", userId: user.id });
        broadcast({ type: "vesting", userId: user.id, claimed: miningData.sharesAccumulated });

        return res.json({ 
          success: true, 
          sharesClaimed: miningData.sharesAccumulated,
          player,
        });
      }

      // Multi-player mining: distribute shares proportionally
      const totalAccumulated = miningData.sharesAccumulated;
      const totalRate = 100;
      const claimedPlayers = [];
      let totalDistributed = 0;

      // Calculate shares for each player proportionally
      const distributions = splits.map(split => {
        const proportion = split.sharesPerHour / totalRate;
        const shares = Math.floor(proportion * totalAccumulated);
        return { ...split, shares };
      });

      // Distribute remainder deterministically (to players with highest sharesPerHour)
      const remainder = totalAccumulated - distributions.reduce((sum, d) => sum + d.shares, 0);
      const sortedByRate = [...distributions].sort((a, b) => b.sharesPerHour - a.sharesPerHour);
      for (let i = 0; i < remainder; i++) {
        sortedByRate[i].shares += 1;
      }

      // PERFORMANCE OPTIMIZATION: Batch fetch players and holdings in parallel
      const playerIdsForClaim = distributions.filter(d => d.shares > 0).map(d => d.playerId);
      const [claimPlayers, claimHoldings] = await Promise.all([
        storage.getPlayersByIds(playerIdsForClaim),
        storage.getBatchHoldings(user.id, "player", playerIdsForClaim),
      ]);
      
      // Create lookup maps for fast access
      const playersMap = new Map(claimPlayers.map(p => [p.id, p]));

      // Add shares to holdings for each player
      for (const dist of distributions) {
        if (dist.shares === 0) continue;

        const player = playersMap.get(dist.playerId);
        if (!player) continue;

        const holding = claimHoldings.get(dist.playerId);
        if (holding) {
          const newQuantity = holding.quantity + dist.shares;
          const newTotalCost = parseFloat(holding.totalCostBasis); // Mined shares have $0 cost
          const newAvgCost = newTotalCost / newQuantity;
          await storage.updateHolding(user.id, "player", dist.playerId, newQuantity, newAvgCost.toFixed(4));
        } else {
          await storage.updateHolding(user.id, "player", dist.playerId, dist.shares, "0.0000");
        }

        // Record mining claim for activity timeline
        await storage.createMiningClaim({
          userId: user.id,
          playerId: dist.playerId,
          sharesClaimed: dist.shares,
        });

        claimedPlayers.push({
          playerId: dist.playerId,
          playerName: `${player.firstName} ${player.lastName}`,
          sharesClaimed: dist.shares,
        });
        totalDistributed += dist.shares;
      }

      // Increment total shares mined counter
      await storage.incrementTotalSharesMined(user.id, totalDistributed);

      // Reset mining (keep splits intact)
      const now = new Date();
      await storage.updateMining(user.id, {
        sharesAccumulated: 0,
        lastClaimedAt: now,
        lastAccruedAt: now,
        updatedAt: now,
        residualMs: 0,
        capReachedAt: null,
      });

      broadcast({ type: "portfolio", userId: user.id });
      broadcast({ type: "vesting", userId: user.id, claimed: totalDistributed });

      res.json({ 
        success: true, 
        totalSharesClaimed: totalDistributed,
        players: claimedPlayers,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Contests (public - anyone can view)
  app.get("/api/contests", async (req, res) => {
    try {
      const { date } = req.query;
      
      // Fetch ALL contests when date filter is provided, otherwise just open ones
      const allContests = date ? await storage.getContests() : await storage.getContests("open");
      
      // Filter contests based on date
      const now = new Date();
      let filteredContests = allContests;
      
      if (date && typeof date === 'string') {
        // Filter by gameDate (the actual day of the games, not when contest starts)
        // Filter contests where gameDate matches the selected date
        filteredContests = allContests.filter(contest => {
          const gameDate = new Date(contest.gameDate);
          const gameDateStr = gameDate.toISOString().split('T')[0];
          return gameDateStr === date;
        });
      } else {
        // Default behavior: show all upcoming contests (haven't started yet)
        filteredContests = allContests.filter(contest => 
          new Date(contest.startsAt) > now
        );
      }
      
      // If user is authenticated, include their entries
      let enrichedEntries: any[] = [];
      if (req.isAuthenticated() && req.user) {
        try {
          const userId = (req.user as any).claims.sub;
          const user = await storage.getUser(userId);
          if (user) {
            const myEntries = await storage.getUserContestEntries(user.id);
            enrichedEntries = await Promise.all(
              myEntries.map(async (entry) => ({
                ...entry,
                contest: await storage.getContest(entry.contestId),
              }))
            );
          }
        } catch (error) {
          // Ignore auth errors, just don't include entries
          console.log("[contests] Could not fetch user entries:", error);
        }
      }

      res.json({
        contests: filteredContests,
        myEntries: enrichedEntries,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint to manually trigger contest creation (for testing)
  app.post("/api/admin/create-contests", isAuthenticated, async (req, res) => {
    try {
      console.log("[admin] Manually triggering contest creation...");
      const result = await createContests();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint to re-score a contest without redistributing payouts
  app.post("/api/admin/contests/:id/rescore", adminAuth, async (req, res) => {
    try {
      const contestId = req.params.id;
      console.log(`[admin] Manually re-scoring contest ${contestId}...`);
      
      const contest = await storage.getContest(contestId);
      if (!contest) {
        return res.status(404).json({ error: "Contest not found" });
      }
      
      // Only allow re-scoring of completed contests
      if (contest.status !== "completed") {
        return res.status(400).json({ 
          error: `Cannot re-score contest with status "${contest.status}". Only completed contests can be re-scored.` 
        });
      }
      
      // Recalculate leaderboard (updates scores, ranks, and lineup fantasy points)
      // This does NOT redistribute payouts
      const leaderboard = await calculateContestLeaderboard(contestId);
      
      console.log(`[admin] Contest ${contestId} re-scored successfully. ${leaderboard.length} entries processed.`);
      
      res.json({
        success: true,
        contestId,
        contestName: contest.name,
        entriesProcessed: leaderboard.length,
        leaderboard: leaderboard.slice(0, 10), // Return top 10 for verification
      });
    } catch (error: any) {
      console.error("[admin] Error re-scoring contest:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Contest entry form
  app.get("/api/contest/:id/entry", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const contest = await storage.getContest(req.params.id);

      if (!contest) {
        return res.status(404).json({ error: "Contest not found" });
      }

      const userHoldings = await storage.getUserHoldings(user.id);
      const eligiblePlayers = await Promise.all(
        userHoldings
          .filter(h => h.assetType === "player")
          .map(async (holding) => {
            const availableShares = await storage.getAvailableShares(user.id, "player", holding.assetId);
            return {
              ...holding,
              availableShares, // Available shares (unlocked)
              player: await storage.getPlayer(holding.assetId),
              isEligible: true, // Simplified - would check game schedule
            };
          })
      );

      res.json({
        contest: {
          id: contest.id,
          name: contest.name,
          sport: contest.sport,
          startsAt: contest.startsAt,
          gameDate: contest.gameDate,
        },
        eligiblePlayers,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Submit contest entry
  app.post("/api/contest/:id/enter", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const contest = await storage.getContest(req.params.id);

      if (!contest) {
        return res.status(404).json({ error: "Contest not found" });
      }

      // Check if contest is locked (started)
      if (new Date() >= new Date(contest.startsAt)) {
        return res.status(400).json({ error: "Contest has already started and is locked" });
      }

      const { lineup } = req.body;

      if (!lineup || lineup.length === 0) {
        return res.status(400).json({ error: "Lineup cannot be empty" });
      }

      // VALIDATE: Ensure all player IDs are numeric (MySportsFeeds IDs)
      // Reject any slug-style IDs to prevent data corruption
      for (const item of lineup) {
        if (!/^\d+$/.test(item.playerId)) {
          return res.status(400).json({ 
            error: `Invalid player ID: ${item.playerId}. Player IDs must be numeric MySportsFeeds IDs, not slugs.` 
          });
        }
      }

      // VALIDATE: Check user has enough available shares BEFORE creating entry
      // Available shares = total - locked (in orders, other contests, mining)
      const playerIds = lineup.map((item: any) => item.playerId);
      const players = await storage.getPlayersByIds(playerIds);
      const playerMap = new Map(players.map(p => [p.id, p]));
      
      for (const item of lineup) {
        const availableShares = await storage.getAvailableShares(user.id, "player", item.playerId);
        if (availableShares < item.sharesEntered) {
          const player = playerMap.get(item.playerId);
          const playerName = player ? `${player.firstName} ${player.lastName}` : item.playerId;
          return res.status(400).json({ 
            error: `Insufficient available shares for ${playerName}. Required: ${item.sharesEntered}, Available: ${availableShares}` 
          });
        }
      }

      // Calculate total shares
      const totalShares = lineup.reduce((sum: number, item: any) => sum + item.sharesEntered, 0);

      // Create entry
      const entry = await storage.createContestEntry({
        contestId: req.params.id,
        userId: user.id,
        totalSharesEntered: totalShares,
      });

      // Create lineup items and burn shares from holdings
      for (const item of lineup) {
        await storage.createContestLineup({
          entryId: entry.id,
          playerId: item.playerId,
          sharesEntered: item.sharesEntered,
        });

        const holding = await storage.getHolding(user.id, "player", item.playerId);
        // Safe to burn now - already validated above
        if (holding) {
          await storage.updateHolding(
            user.id,
            "player",
            item.playerId,
            holding.quantity - item.sharesEntered,
            holding.avgCostBasis
          );
        }
      }

      // Update contest metrics atomically
      await storage.updateContestMetrics(req.params.id, totalShares, contest.entryFee);

      // Broadcast contest update
      broadcast({ type: "contestUpdate", contestId: req.params.id });

      res.json({ success: true, entry });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get existing contest entry for editing
  app.get("/api/contest/:contestId/entry/:entryId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { contestId, entryId } = req.params;

      const contest = await storage.getContest(contestId);
      if (!contest) {
        return res.status(404).json({ error: "Contest not found" });
      }

      // Check if contest is locked
      if (new Date() >= new Date(contest.startsAt)) {
        return res.status(400).json({ error: "Contest has started and is locked for editing" });
      }

      const result = await storage.getContestEntryWithLineup(entryId, user.id);
      if (!result) {
        return res.status(404).json({ error: "Entry not found or unauthorized" });
      }

      // Get player details for lineup
      const enrichedLineup = await Promise.all(
        result.lineup.map(async (item: any) => ({
          ...item,
          player: await storage.getPlayer(item.playerId),
        }))
      );

      // Get ALL eligible players: current holdings (including new acquisitions) + lineup players
      const userHoldings = await storage.getUserHoldings(user.id);
      const holdingsMap = new Map(
        userHoldings
          .filter(h => h.assetType === "player")
          .map(h => [h.assetId, h])
      );

      // Build eligible players from all holdings and lineup players
      const allPlayerIds = new Set([
        ...userHoldings.filter(h => h.assetType === "player").map(h => h.assetId),
        ...result.lineup.map((l: any) => l.playerId)
      ]);

      const eligiblePlayers = await Promise.all(
        Array.from(allPlayerIds).map(async (playerId) => {
          const holding = holdingsMap.get(playerId);
          const lineupItem = result.lineup.find((l: any) => l.playerId === playerId);
          const player = await storage.getPlayer(playerId);
          
          // Total available = current holding + shares in lineup
          const currentQuantity = holding?.quantity || 0;
          const lineupShares = lineupItem?.sharesEntered || 0;
          const totalAvailable = currentQuantity + lineupShares;

          return {
            assetId: playerId,
            assetType: "player" as const,
            quantity: totalAvailable,
            userId: user.id,
            avgCostBasis: holding?.avgCostBasis || "0.0000",
            player,
            isEligible: true,
          };
        })
      );

      res.json({
        contest: {
          id: contest.id,
          name: contest.name,
          sport: contest.sport,
          startsAt: contest.startsAt,
          gameDate: contest.gameDate,
        },
        entry: result.entry,
        lineup: enrichedLineup,
        eligiblePlayers,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update contest entry (edit lineup before lock)
  app.put("/api/contest/:contestId/entry/:entryId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { contestId, entryId } = req.params;
      const { lineup } = req.body;

      const contest = await storage.getContest(contestId);
      if (!contest) {
        return res.status(404).json({ error: "Contest not found" });
      }

      // Check if contest is locked
      if (new Date() >= new Date(contest.startsAt)) {
        return res.status(400).json({ error: "Contest has started and is locked for editing" });
      }

      if (!lineup || lineup.length === 0) {
        return res.status(400).json({ error: "Lineup cannot be empty" });
      }

      // VALIDATE: Ensure all player IDs are numeric (MySportsFeeds IDs)
      // Reject any slug-style IDs to prevent data corruption
      for (const item of lineup) {
        if (!/^\d+$/.test(item.playerId)) {
          return res.status(400).json({ 
            error: `Invalid player ID: ${item.playerId}. Player IDs must be numeric MySportsFeeds IDs, not slugs.` 
          });
        }
      }

      // Get existing entry
      const existing = await storage.getContestEntryWithLineup(entryId, user.id);
      if (!existing) {
        return res.status(404).json({ error: "Entry not found or unauthorized" });
      }

      // Get current user holdings for validation
      const userHoldings = await storage.getUserHoldings(user.id);
      const holdingsMap = new Map(
        userHoldings
          .filter(h => h.assetType === "player")
          .map(h => [h.assetId, h.quantity])
      );

      // Calculate share differences and validate
      const oldLineupMap = new Map<string, number>(existing.lineup.map((item: any) => [item.playerId, item.sharesEntered]));
      const newLineupMap = new Map<string, number>(lineup.map((item: any) => [item.playerId, item.sharesEntered]));

      // Fetch player data for error messages
      const allPlayerIds = Array.from(newLineupMap.keys());
      const playersForUpdate = await storage.getPlayersByIds(allPlayerIds);
      const playerMapForUpdate = new Map(playersForUpdate.map(p => [p.id, p]));

      // Validate that user has sufficient shares for the new lineup
      for (const [playerId, newShares] of Array.from(newLineupMap.entries())) {
        const oldShares = oldLineupMap.get(playerId) || 0;
        const currentHolding = holdingsMap.get(playerId) || 0;
        const availableShares = Number(currentHolding) + Number(oldShares); // Current holdings + shares currently in lineup
        
        if (newShares > availableShares) {
          const player = playerMapForUpdate.get(playerId);
          const playerName = player ? `${player.firstName} ${player.lastName}` : playerId;
          return res.status(400).json({ 
            error: `Insufficient shares for ${playerName}. Available: ${availableShares}, Requested: ${newShares}` 
          });
        }
      }

      // Return shares that were removed or reduced
      for (const [playerId, oldShares] of Array.from(oldLineupMap.entries())) {
        const newShares = newLineupMap.get(playerId) || 0;
        if (newShares < oldShares) {
          const sharesToReturn = Number(oldShares) - Number(newShares);
          const holding = await storage.getHolding(user.id, "player", playerId);
          if (holding) {
            await storage.updateHolding(
              user.id,
              "player",
              playerId,
              holding.quantity + sharesToReturn,
              holding.avgCostBasis
            );
          } else {
            // Create new holding if user didn't have any
            await storage.updateHolding(user.id, "player", playerId, sharesToReturn, "0.0000");
          }
        }
      }

      // VALIDATE AND BURN: Check holdings AFTER returns, then burn additional shares
      for (const [playerId, newShares] of Array.from(newLineupMap.entries())) {
        const oldShares = oldLineupMap.get(playerId) || 0;
        if (newShares > oldShares) {
          const sharesToBurn = Number(newShares) - Number(oldShares);
          // Re-fetch holding after share returns to get current state
          const holding = await storage.getHolding(user.id, "player", playerId);
          
          // CRITICAL: Validate user has enough shares AFTER returns
          if (!holding || holding.quantity < sharesToBurn) {
            return res.status(400).json({ 
              error: `Insufficient shares for player ${playerId}. Required: ${sharesToBurn}, Available: ${holding?.quantity || 0}` 
            });
          }
          
          // Safe to burn now - validated above
          await storage.updateHolding(
            user.id,
            "player",
            playerId,
            holding.quantity - sharesToBurn,
            holding.avgCostBasis
          );
        }
      }

      // Calculate new total shares
      const totalShares = lineup.reduce((sum: number, item: any) => sum + item.sharesEntered, 0);
      const oldTotalShares = existing.entry.totalSharesEntered;

      // Delete old lineup and create new one
      await storage.deleteContestLineup(entryId);
      for (const item of lineup) {
        await storage.createContestLineup({
          entryId,
          playerId: item.playerId,
          sharesEntered: item.sharesEntered,
        });
      }

      // Update entry total shares
      await storage.updateContestEntry(entryId, { totalSharesEntered: totalShares });

      // Update contest metrics with the share difference (not entry count)
      const shareDifference = totalShares - oldTotalShares;
      if (shareDifference !== 0) {
        // Fetch current contest to calculate new total shares
        const currentContest = await storage.getContest(contestId);
        if (currentContest) {
          const newTotalShares = currentContest.totalSharesEntered + shareDifference;
          await storage.updateContest(contestId, {
            totalSharesEntered: newTotalShares,
          });
        }
      }

      // Broadcast contest update
      broadcast({ type: "contestUpdate", contestId });

      // Fetch updated entry to return fresh data
      const updatedEntry = await storage.getContestEntryWithLineup(entryId, user.id);
      
      res.json({ 
        success: true,
        entry: updatedEntry?.entry,
        totalShares
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get detailed contest entry information (public - anyone can view)
  app.get("/api/contest/:contestId/entries/:entryId", async (req, res) => {
    try {
      const { contestId, entryId } = req.params;
      const entryDetails = await storage.getContestEntryDetail(contestId, entryId);

      if (!entryDetails) {
        return res.status(404).json({ error: "Entry not found" });
      }

      res.json(entryDetails);
    } catch (error: any) {
      console.error("[entry-detail] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Contest leaderboard with proportional scoring (public - anyone can view)
  app.get("/api/contest/:id/leaderboard", async (req, res) => {
    try {
      const contest = await storage.getContest(req.params.id);

      if (!contest) {
        return res.status(404).json({ error: "Contest not found" });
      }

      // Calculate real-time leaderboard with proportional scoring
      const { calculateContestLeaderboard } = await import("./contest-scoring");
      const leaderboard = await calculateContestLeaderboard(req.params.id);

      // If user is authenticated, find their entry
      let myEntry = undefined;
      if (req.isAuthenticated() && req.user) {
        try {
          const userId = (req.user as any).claims.sub;
          const user = await storage.getUser(userId);
          if (user) {
            myEntry = leaderboard.find(e => e.userId === user.id);
          }
        } catch (error) {
          // Ignore auth errors
          console.log("[leaderboard] Could not fetch user entry:", error);
        }
      }

      res.json({
        contest,
        leaderboard,
        myEntry,
      });
    } catch (error: any) {
      console.error("[leaderboard] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Global leaderboards (public)
  app.get("/api/leaderboards", async (req, res) => {
    try {
      const category = req.query.category as string || "netWorth";

      if (category === "sharesMined") {
        // Sort by total shares mined
        const allUsers = await storage.getUsers();
        const ranked = allUsers
          .sort((a: User, b: User) => b.totalSharesMined - a.totalSharesMined)
          .map((u: User, index: number) => ({
            rank: index + 1,
            userId: u.id,
            username: u.username,
            profileImageUrl: u.profileImageUrl,
            value: u.totalSharesMined,
          }));
        
        return res.json({ category: "sharesMined", leaderboard: ranked });
      }

      if (category === "marketOrders") {
        // Sort by total market orders
        const allUsers = await storage.getUsers();
        const ranked = allUsers
          .sort((a: User, b: User) => b.totalMarketOrders - a.totalMarketOrders)
          .map((u: User, index: number) => ({
            rank: index + 1,
            userId: u.id,
            username: u.username,
            profileImageUrl: u.profileImageUrl,
            value: u.totalMarketOrders,
          }));
        
        return res.json({ category: "marketOrders", leaderboard: ranked });
      }

      if (category === "cashBalance" || category === "portfolioValue" || category === "netWorth") {
        // Use optimized method to get all users with rankings in one query
        const usersWithPortfolio = await storage.getAllUsersForRanking();
        
        // Get user details for profile images and usernames
        const allUsers = await storage.getUsers();
        const userMap = new Map(allUsers.map(u => [u.id, u]));

        let sortedUsers: any[];
        
        if (category === "cashBalance") {
          sortedUsers = usersWithPortfolio
            .sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance))
            .map((data, index) => {
              const user = userMap.get(data.userId);
              return {
                rank: index + 1,
                userId: data.userId,
                username: user?.username || "Unknown",
                profileImageUrl: user?.profileImageUrl || null,
                value: parseFloat(data.balance).toFixed(2),
              };
            });
        } else if (category === "portfolioValue") {
          sortedUsers = usersWithPortfolio
            .sort((a, b) => b.portfolioValue - a.portfolioValue)
            .map((data, index) => {
              const user = userMap.get(data.userId);
              return {
                rank: index + 1,
                userId: data.userId,
                username: user?.username || "Unknown",
                profileImageUrl: user?.profileImageUrl || null,
                value: data.portfolioValue.toFixed(2),
              };
            });
        } else {
          // netWorth
          sortedUsers = usersWithPortfolio
            .map(data => ({
              ...data,
              netWorth: parseFloat(data.balance) + data.portfolioValue,
            }))
            .sort((a, b) => b.netWorth - a.netWorth)
            .map((data, index) => {
              const user = userMap.get(data.userId);
              return {
                rank: index + 1,
                userId: data.userId,
                username: user?.username || "Unknown",
                profileImageUrl: user?.profileImageUrl || null,
                value: data.netWorth.toFixed(2),
              };
            });
        }

        return res.json({ category, leaderboard: sortedUsers });
      }

      res.status(400).json({ error: "Invalid category" });
    } catch (error: any) {
      console.error("[leaderboards] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Blog posts - public listing (published posts only)
  app.get("/api/blog", async (req, res) => {
    try {
      const { limit, offset } = req.query;
      const parsedLimit = limit ? parseInt(limit as string) : 20;
      const parsedOffset = offset ? parseInt(offset as string) : 0;
      
      const safeLimit = isNaN(parsedLimit) ? 20 : Math.max(1, Math.min(parsedLimit, 100));
      const safeOffset = isNaN(parsedOffset) ? 0 : Math.max(0, parsedOffset);
      
      const { posts, total } = await storage.getBlogPosts({ 
        limit: safeLimit, 
        offset: safeOffset,
        publishedOnly: true,
      });
      
      res.json({ posts, total, limit: safeLimit, offset: safeOffset });
    } catch (error: any) {
      console.error("[blog] Error fetching posts:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Blog post detail - public (by slug)
  app.get("/api/blog/:slug", async (req, res) => {
    try {
      const post = await storage.getBlogPostBySlug(req.params.slug);
      
      if (!post) {
        return res.status(404).json({ error: "Blog post not found" });
      }
      
      // Only return published posts to public
      if (!post.publishedAt) {
        return res.status(404).json({ error: "Blog post not found" });
      }
      
      // Get author information
      const author = await storage.getUser(post.authorId);
      
      res.json({ 
        post,
        author: author ? {
          id: author.id,
          username: author.username,
          firstName: author.firstName,
          lastName: author.lastName,
          profileImageUrl: author.profileImageUrl,
        } : null,
      });
    } catch (error: any) {
      console.error("[blog] Error fetching post:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Sitemap.xml for Google Search Console
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const baseUrl = req.protocol + '://' + req.get('host');
      
      // Get all published blog posts
      const { posts } = await storage.getBlogPosts({ 
        limit: 1000, 
        offset: 0, 
        publishedOnly: true 
      });
      
      // Generate sitemap XML
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/blog</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/how-it-works</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/contact</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${baseUrl}/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${baseUrl}/terms</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
${posts.map(post => `  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>
    <lastmod>${new Date(post.publishedAt || post.createdAt).toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n')}
</urlset>`;
      
      res.header('Content-Type', 'application/xml');
      res.send(sitemap);
    } catch (error: any) {
      console.error("[sitemap] Error generating sitemap:", error);
      res.status(500).send('Error generating sitemap');
    }
  });

  // Admin: List all blog posts (including drafts)
  app.get("/api/admin/blog", adminAuth, async (req, res) => {
    try {
      const { limit, offset } = req.query;
      const parsedLimit = limit ? parseInt(limit as string) : 50;
      const parsedOffset = offset ? parseInt(offset as string) : 0;
      
      const safeLimit = isNaN(parsedLimit) ? 50 : Math.max(1, Math.min(parsedLimit, 200));
      const safeOffset = isNaN(parsedOffset) ? 0 : Math.max(0, parsedOffset);
      
      const { posts, total } = await storage.getBlogPosts({ 
        limit: safeLimit, 
        offset: safeOffset,
        publishedOnly: false, // Show drafts for admin
      });
      
      res.json({ posts, total, limit: safeLimit, offset: safeOffset });
    } catch (error: any) {
      console.error("[admin/blog] Error fetching posts:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Create blog post
  app.post("/api/admin/blog", adminAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      // Validate request body
      const { title, slug, excerpt, content, publishedAt } = req.body;
      
      if (!title?.trim() || !slug?.trim() || !excerpt?.trim() || !content?.trim()) {
        return res.status(400).json({ error: "title, slug, excerpt, and content are required and cannot be empty" });
      }
      
      // Validate slug format (alphanumeric and hyphens only)
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({ error: "slug must contain only lowercase letters, numbers, and hyphens" });
      }
      
      const post = await storage.createBlogPost({
        title: title.trim(),
        slug: slug.trim(),
        excerpt: excerpt.trim(),
        content: content.trim(),
        authorId: userId,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
      });
      
      res.json({ post });
    } catch (error: any) {
      console.error("[admin/blog] Error creating post:", error);
      
      // Handle duplicate slug error
      if (error.message && error.message.includes('duplicate key') || error.code === '23505') {
        return res.status(409).json({ error: "A blog post with this slug already exists" });
      }
      
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Update blog post
  app.patch("/api/admin/blog/:id", adminAuth, async (req, res) => {
    try {
      const { title, slug, excerpt, content, publishedAt } = req.body;
      
      const updates: any = {};
      
      // Validate and trim provided fields
      if (title !== undefined) {
        if (!title.trim()) {
          return res.status(400).json({ error: "title cannot be empty" });
        }
        updates.title = title.trim();
      }
      
      if (slug !== undefined) {
        if (!slug.trim()) {
          return res.status(400).json({ error: "slug cannot be empty" });
        }
        // Validate slug format
        if (!/^[a-z0-9-]+$/.test(slug)) {
          return res.status(400).json({ error: "slug must contain only lowercase letters, numbers, and hyphens" });
        }
        updates.slug = slug.trim();
      }
      
      if (excerpt !== undefined) {
        if (!excerpt.trim()) {
          return res.status(400).json({ error: "excerpt cannot be empty" });
        }
        updates.excerpt = excerpt.trim();
      }
      
      if (content !== undefined) {
        if (!content.trim()) {
          return res.status(400).json({ error: "content cannot be empty" });
        }
        updates.content = content.trim();
      }
      
      if (publishedAt !== undefined) {
        updates.publishedAt = publishedAt ? new Date(publishedAt) : null;
      }
      
      updates.updatedAt = new Date();
      
      const post = await storage.updateBlogPost(req.params.id, updates);
      
      if (!post) {
        return res.status(404).json({ error: "Blog post not found" });
      }
      
      res.json({ post });
    } catch (error: any) {
      console.error("[admin/blog] Error updating post:", error);
      
      // Handle duplicate slug error
      if (error.message && error.message.includes('duplicate key') || error.code === '23505') {
        return res.status(409).json({ error: "A blog post with this slug already exists" });
      }
      
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Delete blog post
  app.delete("/api/admin/blog/:id", adminAuth, async (req, res) => {
    try {
      await storage.deleteBlogPost(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[admin/blog] Error deleting post:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Portfolio history with time range support
  app.get("/api/user/portfolio-history", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const timeRange = (req.query.timeRange as string) || "1M";
      
      // Calculate date range based on timeRange parameter
      const now = new Date();
      let startDate = new Date();
      
      switch (timeRange) {
        case "1D":
          startDate.setDate(now.getDate() - 1);
          break;
        case "7D":
          startDate.setDate(now.getDate() - 7);
          break;
        case "1M":
          startDate.setMonth(now.getMonth() - 1);
          break;
        case "1Y":
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        case "ALL":
          // Set to a very early date to get all snapshots
          startDate = new Date(2020, 0, 1);
          break;
        default:
          return res.status(400).json({ error: "Invalid timeRange. Use: 1D, 7D, 1M, 1Y, or ALL" });
      }
      
      // Query snapshots from the database
      const snapshots = await storage.getPortfolioSnapshotsInRange(userId, startDate, now);
      
      // Transform snapshots into chart-friendly format with ISO string dates
      const history = snapshots.map(snapshot => ({
        date: snapshot.snapshotDate.toISOString(),
        cashBalance: parseFloat(snapshot.cashBalance),
        portfolioValue: parseFloat(snapshot.portfolioValue),
        netWorth: parseFloat(snapshot.totalNetWorth),
        cashRank: snapshot.cashRank,
        portfolioRank: snapshot.portfolioRank,
      }));
      
      res.json({ history, timeRange });
    } catch (error: any) {
      console.error("[portfolio-history] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Public user profile (anyone can view)
  app.get("/api/user/:userId/profile", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get user holdings with market values
      const userHoldings = await storage.getUserHoldings(user.id);
      const enrichedHoldings = await Promise.all(
        userHoldings.map(async (holding) => {
          if (holding.assetType === "player") {
            const player = await storage.getPlayer(holding.assetId);
            if (player) {
              const marketValue = player.lastTradePrice 
                ? (parseFloat(player.lastTradePrice) * holding.quantity).toFixed(2)
                : null;
              return {
                ...holding,
                player,
                lastTradePrice: player.lastTradePrice,
                marketValue,
              };
            }
          }
          return holding;
        })
      );

      // Calculate net worth (balance + total market value of holdings)
      const holdingsValue = enrichedHoldings.reduce((sum: number, h: any) => {
        return sum + (h.marketValue ? parseFloat(h.marketValue as string) : 0);
      }, 0);
      const netWorth = (parseFloat(user.balance) + holdingsValue).toFixed(2);

      // Get leaderboard rankings
      const allUsers = await storage.getUsers();
      
      // Calculate rankings
      const sharesMinedRank = allUsers
        .sort((a: User, b: User) => b.totalSharesMined - a.totalSharesMined)
        .findIndex((u: User) => u.id === user.id) + 1;
      
      const marketOrdersRank = allUsers
        .sort((a: User, b: User) => b.totalMarketOrders - a.totalMarketOrders)
        .findIndex((u: User) => u.id === user.id) + 1;

      // Calculate net worth for all users (with proper price fetching)
      const usersWithNetWorth = await Promise.all(
        allUsers.map(async (u: User) => {
          const holdings = await storage.getUserHoldings(u.id);
          const holdingsVal = await Promise.all(
            holdings.map(async (h: Holding) => {
              if (h.assetType === "player") {
                const p = await storage.getPlayer(h.assetId);
                if (p?.lastTradePrice) {
                  return parseFloat(p.lastTradePrice) * h.quantity;
                }
              }
              return 0;
            })
          );
          const totalHoldingsVal = holdingsVal.reduce((sum: number, v: number) => sum + v, 0);
          return {
            userId: u.id,
            netWorth: parseFloat(u.balance) + totalHoldingsVal,
          };
        })
      );

      const netWorthRank = usersWithNetWorth
        .sort((a: { userId: string; netWorth: number }, b: { userId: string; netWorth: number }) => b.netWorth - a.netWorth)
        .findIndex((u: { userId: string; netWorth: number }) => u.userId === user.id) + 1;

      res.json({
        user: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          isAdmin: user.isAdmin || false,
          isPremium: user.isPremium,
          createdAt: user.createdAt,
        },
        stats: {
          netWorth,
          totalSharesMined: user.totalSharesMined,
          totalMarketOrders: user.totalMarketOrders,
          totalTradesExecuted: user.totalTradesExecuted,
          holdingsCount: enrichedHoldings.length,
        },
        rankings: {
          sharesMined: sharesMinedRank,
          marketOrders: marketOrdersRank,
          netWorth: netWorthRank,
        },
        holdings: enrichedHoldings.filter(h => h.assetType === "player" && h.quantity > 0),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Premium redeem
  app.post("/api/premium/redeem", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const premiumHolding = await storage.getHolding(user.id, "premium", "premium");

      if (!premiumHolding || premiumHolding.quantity < 1) {
        return res.status(400).json({ error: "No premium shares to redeem" });
      }

      // Burn 1 premium share
      await storage.updateHolding(user.id, "premium", "premium", premiumHolding.quantity - 1, "0.0000");

      // Grant premium access for 30 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Update user premium status (would use storage method, but simplified here)
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin middleware - validates ADMIN_API_TOKEN (for external cron) OR isAdmin flag (for logged-in users)
  async function adminAuth(req: any, res: any, next: any) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const expectedToken = process.env.ADMIN_API_TOKEN;
    
    // Check 1: Token-based auth (for external cron jobs)
    if (token) {
      if (!expectedToken) {
        console.warn('[ADMIN] ADMIN_API_TOKEN not configured - admin endpoints disabled for external access');
        return res.status(503).json({ error: 'Admin endpoints not configured' });
      }
      if (token === expectedToken) {
        return next();
      }
      const clientIp = req.ip || req.connection.remoteAddress;
      console.warn(`[ADMIN] Invalid token from ${clientIp} to ${req.path}`);
      return res.status(401).json({ error: 'Unauthorized - invalid token' });
    }
    
    // Check 2: Dev mode bypass - create mock user if needed
    const isDev = process.env.NODE_ENV === 'development';
    const bypassAuth = process.env.DEV_BYPASS_AUTH !== 'false';
    
    if (isDev && bypassAuth && !req.user) {
      // Create a mock dev user session (same as in replitAuth.ts)
      const mockUser = {
        claims: {
          sub: 'dev-user-12345678',
          email: 'dev@example.com',
          first_name: 'Dev',
          last_name: 'User',
        },
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        access_token: 'dev-mock-token',
        refresh_token: 'dev-mock-refresh',
      };
      
      // Use passport's login to properly serialize and persist the session
      req.login(mockUser, (err: any) => {
        if (err) {
          console.error('[ADMIN] Failed to establish mock session:', err);
          return res.status(500).json({ error: 'Session initialization failed' });
        }
        console.log(`[ADMIN] Dev bypass: ${req.method} ${req.path} - mock session established`);
        next();
      });
      return; // Prevent falling through to Check 3
    }
    
    // Check 3: Admin role check with req.user
    try {
      let userId: string | null = null;
      
      if (req.user?.claims?.sub) {
        userId = req.user.claims.sub;
      } else if (req.user?.id) {
        userId = req.user.id;
      }
      
      if (userId) {
        const user = await storage.getUser(userId);
        if (user?.isAdmin) {
          return next();
        }
      }
    } catch (error) {
      console.error('[ADMIN] Error checking admin status:', error);
    }
    
    const clientIp = req.ip || req.connection.remoteAddress;
    console.warn(`[ADMIN] Unauthorized access attempt from ${clientIp} to ${req.path}`);
    return res.status(401).json({ error: 'Unauthorized - admin access required' });
  }

  // Admin endpoint: Get system statistics
  app.get("/api/admin/stats", adminAuth, async (req, res) => {
    try {
      const [users, players, allContests, jobLogs] = await Promise.all([
        storage.getUsers(),
        storage.getPlayers(),
        storage.getContests(),
        storage.getRecentJobLogs(undefined, 50),
      ]);
      const openContests = allContests.filter((c: any) => c.status === 'open').length;
      const liveContests = allContests.filter((c: any) => c.status === 'live').length;
      const completedContests = allContests.filter((c: any) => c.status === 'completed').length;

      // Get today's API request count from job logs
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayLogs = jobLogs.filter((log: any) => {
        const logDate = new Date(log.scheduledFor);
        logDate.setHours(0, 0, 0, 0);
        return logDate.getTime() === today.getTime();
      });
      const apiRequestsToday = todayLogs.reduce((sum: number, log: any) => sum + (log.requestCount || 0), 0);

      // Get last run for each job type
      const jobTypes = ['roster_sync', 'schedule_sync', 'stats_sync', 'create_contests', 'settle_contests'];
      const lastJobRuns = jobTypes.map(jobName => {
        const logs = jobLogs.filter((log: any) => log.jobName === jobName);
        const lastLog = logs.length > 0 ? logs[0] : null;
        return {
          jobName,
          status: lastLog?.status || 'never_run',
          finishedAt: lastLog?.finishedAt || null,
          recordsProcessed: lastLog?.recordsProcessed || 0,
          errorCount: lastLog?.errorCount || 0,
        };
      });

      res.json({
        totalUsers: users.length,
        totalPlayers: players.length,
        totalContests: allContests.length,
        openContests,
        liveContests,
        completedContests,
        apiRequestsToday,
        lastJobRuns,
      });
    } catch (error: any) {
      console.error('[ADMIN] Failed to get stats:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: Manually trigger cron jobs
  app.post("/api/admin/jobs/trigger", adminAuth, async (req, res) => {
    try {
      const { jobName, operationId } = req.body;
      const clientIp = req.ip || req.connection.remoteAddress;
      
      if (!jobName) {
        return res.status(400).json({ error: 'jobName required' });
      }
      
      const validJobs = ['roster_sync', 'sync_player_game_logs', 'schedule_sync', 'stats_sync', 'create_contests', 'settle_contests', 'daily_snapshot', 'backfill_market_snapshots', 'bot_engine'];
      if (!validJobs.includes(jobName)) {
        return res.status(400).json({ error: `Invalid jobName. Must be one of: ${validJobs.join(', ')}` });
      }
      
      console.log(`[ADMIN] Job trigger requested by ${clientIp}: ${jobName}${operationId ? ` (operation: ${operationId})` : ''}`);
      
      // Create progress callback if operationId provided
      let progressCallback;
      if (operationId) {
        const { createProgressCallback } = await import('./lib/admin-stream');
        progressCallback = createProgressCallback(operationId);
        
        // Emit initial event
        progressCallback({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `Starting job: ${jobName}`,
          data: { jobName },
        });
      }
      
      // Trigger job with optional progress callback
      const result = await jobScheduler.triggerJob(jobName, progressCallback);
      
      console.log(`[ADMIN] Job ${jobName} completed - ${result.recordsProcessed} records, ${result.errorCount} errors, ${result.requestCount} requests`);
      
      // Emit completion event if callback exists
      if (progressCallback) {
        progressCallback({
          type: 'complete',
          timestamp: new Date().toISOString(),
          message: result.errorCount > 0 
            ? `Job ${jobName} completed with ${result.errorCount} errors`
            : `Job ${jobName} completed successfully`,
          data: {
            success: result.errorCount === 0,
            jobName,
            recordsProcessed: result.recordsProcessed,
            errorCount: result.errorCount,
            requestCount: result.requestCount,
          },
        });
      }
      
      res.json({
        success: true,
        jobName,
        result,
        status: result.errorCount > 0 ? 'degraded' : 'success',
      });
    } catch (error: any) {
      console.error('[ADMIN] Job trigger failed:', error.message);
      
      // Emit error event if callback exists (create it from body if available)
      const { operationId } = req.body;
      if (operationId) {
        try {
          const { createProgressCallback } = await import('./lib/admin-stream');
          const progressCallback = createProgressCallback(operationId);
          progressCallback({
            type: 'error',
            timestamp: new Date().toISOString(),
            message: `Job failed: ${error.message}`,
            data: { error: error.message, stack: error.stack },
          });
          progressCallback({
            type: 'complete',
            timestamp: new Date().toISOString(),
            message: 'Job failed',
            data: { success: false },
          });
        } catch (streamError) {
          console.error('[ADMIN] Failed to emit error event:', streamError);
        }
      }
      
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: SSE stream for operation logs
  app.get("/api/admin/stream/:operationId", adminAuth, async (req, res) => {
    const { operationId } = req.params;
    
    try {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      
      // Send initial connection message
      res.write(`data: ${JSON.stringify({
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `Connected to operation ${operationId}`,
      })}\n\n`);
      
      // Register this client with the stream manager
      const { adminStreamManager } = await import('./lib/admin-stream');
      adminStreamManager.registerClient(operationId, res);
      
      console.log(`[SSE] Client connected to operation ${operationId}`);
      
      // Handle client disconnect
      req.on('close', () => {
        console.log(`[SSE] Client disconnected from operation ${operationId}`);
        adminStreamManager.unregisterClient(operationId, res);
      });
      
      // Prevent error handler from trying to send JSON response
      req.on('error', (err) => {
        console.error(`[SSE] Stream error for ${operationId}:`, err);
        if (!res.writableEnded) {
          res.end();
        }
      });
    } catch (error: any) {
      console.error(`[SSE] Failed to setup stream for ${operationId}:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        res.end();
      }
    }
  });

  // Admin endpoint: Backfill game logs for date range
  app.post("/api/admin/backfill", adminAuth, async (req, res) => {
    try {
      const { startDate, endDate, operationId } = req.body;
      const clientIp = req.ip || req.connection.remoteAddress;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate required (YYYY-MM-DD format)' });
      }
      
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }
      
      // Parse and normalize dates to UTC midnight
      const start = new Date(startDate + 'T00:00:00.000Z');
      const end = new Date(endDate + 'T00:00:00.000Z');
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid date values' });
      }
      
      if (start > end) {
        return res.status(400).json({ error: 'startDate must be before or equal to endDate' });
      }
      
      // Enforce max range (90 days to prevent abuse and rate limit exhaustion)
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const MAX_DAYS = 90;
      if (daysDiff > MAX_DAYS) {
        return res.status(400).json({ 
          error: `Date range too large. Maximum ${MAX_DAYS} days allowed. You requested ${daysDiff} days.` 
        });
      }
      
      // Validate dates are not in the future
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (start > now || end > now) {
        return res.status(400).json({ error: 'Cannot backfill future dates' });
      }
      
      // Validate dates are within current season range (Oct 1 to now)
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const seasonStartYear = currentMonth >= 6 ? currentYear : currentYear - 1;
      const seasonStart = new Date(seasonStartYear, 9, 1); // Oct 1
      
      if (start < seasonStart) {
        return res.status(400).json({ 
          error: `startDate must be on or after season start (${seasonStart.toISOString().split('T')[0]})` 
        });
      }
      
      console.log(`[ADMIN] Backfill requested by ${clientIp}: ${startDate} to ${endDate} (${daysDiff + 1} days)`);
      
      // Create progress callback if operationId provided
      let progressCallback;
      if (operationId) {
        const { createProgressCallback } = await import('./lib/admin-stream');
        progressCallback = createProgressCallback(operationId);
      }
      
      // Import syncPlayerGameLogs here to avoid circular dependency
      const { syncPlayerGameLogs } = await import('./jobs/sync-player-game-logs');
      const result = await syncPlayerGameLogs({
        mode: 'backfill',
        startDate: start,
        endDate: end,
        progressCallback,
      });
      
      // Determine status based on errors
      const status = result.errorCount > 0 ? 'degraded' : 'success';
      
      console.log(`[ADMIN] Backfill ${status} - ${result.recordsProcessed} game logs cached, ${result.errorCount} errors, ${result.requestCount} API requests`);
      
      // Only send response if headers haven't been sent yet (streaming case)
      if (!res.headersSent) {
        res.json({
          success: status === 'success',
          status,
          result,
          message: result.errorCount > 0 
            ? `Backfill completed with ${result.errorCount} errors. Check logs for details.`
            : 'Backfill completed successfully',
        });
      }
    } catch (error: any) {
      console.error('[ADMIN] Backfill failed:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      }
    }
  });

  // Admin endpoint: Bot statistics and recent actions
  app.get("/api/admin/bots", adminAuth, async (req, res) => {
    try {
      const { getBotStats } = await import('./bot/bot-engine');
      const { botActionsLog } = await import('@shared/schema');
      
      const stats = await getBotStats();
      
      // Get recent actions
      const recentActions = await db
        .select()
        .from(botActionsLog)
        .orderBy(desc(botActionsLog.createdAt))
        .limit(50);
      
      res.json({
        stats,
        recentActions,
      });
    } catch (error: any) {
      console.error('[ADMIN] Failed to get bot stats:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: Manually trigger bot engine
  app.post("/api/admin/bots/trigger", adminAuth, async (req, res) => {
    try {
      const { runBotEngineTick } = await import('./bot/bot-engine');
      const result = await runBotEngineTick();
      
      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error('[ADMIN] Failed to trigger bot engine:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Analytics API - market insights and player analysis
  app.get("/api/analytics", async (req, res) => {
    try {
      const timeRange = (req.query.timeRange as string) || "24H";
      
      // Calculate date range based on timeRange
      const now = new Date();
      let startDate = new Date();
      switch (timeRange) {
        case "24H": startDate.setDate(now.getDate() - 1); break;
        case "7D": startDate.setDate(now.getDate() - 7); break;
        case "30D": startDate.setDate(now.getDate() - 30); break;
        case "3M": startDate.setMonth(now.getMonth() - 3); break;
        case "1Y": startDate.setFullYear(now.getFullYear() - 1); break;
        case "All": startDate = new Date(2020, 0, 1); break; // From start
        default: startDate.setDate(now.getDate() - 1);
      }

      // Get market health stats and share economy stats from storage
      const [marketHealth, shareEconomy, timeSeries, shareEconomyTimeSeries] = await Promise.all([
        storage.getMarketHealthStats(startDate, now),
        storage.getShareEconomyStats(startDate, now),
        storage.getMarketHealthTimeSeries(startDate, now),
        storage.getShareEconomyTimeSeries(startDate, now),
      ]);
      
      // Calculate percentage changes
      const transactionChange = marketHealth.prevTransactionCount > 0 
        ? ((marketHealth.transactionCount - marketHealth.prevTransactionCount) / marketHealth.prevTransactionCount) * 100 
        : 0;
      const volumeChange = marketHealth.prevTotalVolume > 0 
        ? ((marketHealth.totalVolume - marketHealth.prevTotalVolume) / marketHealth.prevTotalVolume) * 100 
        : 0;
      const marketCapChange = marketHealth.prevTotalMarketCap > 0 
        ? ((marketHealth.totalMarketCap - marketHealth.prevTotalMarketCap) / marketHealth.prevTotalMarketCap) * 100 
        : 0;

      // Get power rankings
      const powerRankingsData = await storage.getPowerRankings(50);
      const powerRankings = powerRankingsData.map((r, idx) => ({
        rank: idx + 1,
        player: {
          id: r.playerId,
          firstName: r.name.split(' ')[0],
          lastName: r.name.split(' ').slice(1).join(' '),
          team: r.team,
          position: r.position,
          lastTradePrice: r.price.toFixed(2),
          volume24h: r.volume,
          priceChange24h: r.priceChange7d.toFixed(2),
        },
        compositeScore: r.compositeScore,
        priceChange7d: r.priceChange7d,
        avgFantasyPoints: r.avgFantasyPoints,
      }));

      // Get position rankings using power rankings data
      const positions = ["PG", "SG", "SF", "PF", "C"];
      const positionRankings = positions.map((position: string) => {
        const posPlayers = powerRankingsData
          .filter(p => p.position.includes(position))
          .slice(0, 10)
          .map((p, idx) => ({
            rank: idx + 1,
            player: {
              id: p.playerId,
              firstName: p.name.split(' ')[0],
              lastName: p.name.split(' ').slice(1).join(' '),
              team: p.team,
              position: p.position,
              lastTradePrice: p.price.toFixed(2),
              volume24h: p.volume,
              priceChange24h: p.priceChange7d.toFixed(2),
            },
            avgFantasyPoints: p.avgFantasyPoints,
            priceChange7d: p.priceChange7d,
          }));
        
        return { position, players: posPlayers };
      });

      // Calculate avg price change from active players
      const allPlayers = await storage.getPlayers();
      const activePlayers = allPlayers.filter((p: Player) => p.isActive);
      const priceChanges = activePlayers.map((p: Player) => parseFloat(p.priceChange24h || "0"));
      const avgPriceChange = priceChanges.length > 0 
        ? priceChanges.reduce((sum: number, c: number) => sum + c, 0) / priceChanges.length 
        : 0;

      // Most active team by volume
      const teamVolumes: Record<string, number> = {};
      activePlayers.forEach((p: Player) => {
        teamVolumes[p.team] = (teamVolumes[p.team] || 0) + (p.volume24h || 0);
      });
      const mostActiveTeam = Object.entries(teamVolumes).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

      res.json({
        marketHealth: {
          transactions: marketHealth.transactionCount,
          transactionChange,
          volume: marketHealth.totalVolume,
          volumeChange,
          marketCap: marketHealth.totalMarketCap,
          marketCapChange,
          sharesMined: shareEconomy.totalSharesMined,
          sharesBurned: shareEconomy.totalSharesBurned,
          totalShares: shareEconomy.totalSharesInEconomy,
          periodSharesMined: shareEconomy.periodSharesMined,
          periodSharesBurned: shareEconomy.periodSharesBurned,
          timeSeries,
          shareEconomyTimeSeries,
        },
        powerRankings,
        positionRankings,
        marketStats: {
          totalVolume24h: marketHealth.totalVolume,
          totalTrades24h: marketHealth.transactionCount,
          avgPriceChange,
          mostActiveTeam,
        },
      });
    } catch (error: any) {
      console.error("[analytics] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Market snapshots API - daily metrics for analytics charts
  app.get("/api/analytics/snapshots", async (req, res) => {
    try {
      const timeRange = (req.query.timeRange as string) || "30D";
      
      // Calculate date range based on timeRange
      const now = new Date();
      let startDate = new Date();
      switch (timeRange) {
        case "7D": startDate.setDate(now.getDate() - 7); break;
        case "30D": startDate.setDate(now.getDate() - 30); break;
        case "3M": startDate.setMonth(now.getMonth() - 3); break;
        case "1Y": startDate.setFullYear(now.getFullYear() - 1); break;
        case "All": startDate = new Date(2020, 0, 1); break;
        default: startDate.setDate(now.getDate() - 30);
      }

      // Query market snapshots from database
      const snapshots = await db
        .select()
        .from(marketSnapshots)
        .where(and(
          gte(marketSnapshots.snapshotDate, startDate),
          lte(marketSnapshots.snapshotDate, now)
        ))
        .orderBy(marketSnapshots.snapshotDate);

      res.json({
        timeRange,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        snapshots: snapshots.map(s => ({
          date: s.snapshotDate,
          marketCap: parseFloat(s.marketCap),
          transactions: s.transactionsCount,
          volume: parseFloat(s.volume),
          sharesMined: s.sharesMined,
          sharesBurned: s.sharesBurned,
          totalShares: s.totalShares,
        })),
      });
    } catch (error: any) {
      console.error("[analytics/snapshots] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Player comparison with full metrics
  app.get("/api/analytics/compare", async (req, res) => {
    try {
      const playerIds = (req.query.playerIds as string || "").split(",").filter(Boolean);
      const timeRange = (req.query.timeRange as string) || "30D";
      
      if (playerIds.length < 1) {
        return res.json({ players: [] });
      }

      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      switch (timeRange) {
        case "7D": startDate.setDate(now.getDate() - 7); break;
        case "30D": startDate.setDate(now.getDate() - 30); break;
        case "3M": startDate.setMonth(now.getMonth() - 3); break;
        case "1Y": startDate.setFullYear(now.getFullYear() - 1); break;
        default: startDate.setDate(now.getDate() - 30);
      }

      // Get all comparison data
      const [sharesMap, contestUsageMap, priceHistoryMap] = await Promise.all([
        storage.getPlayerSharesOutstanding(playerIds),
        storage.getContestUsageStats(playerIds),
        storage.getPriceHistoryRange(playerIds, startDate, now),
      ]);

      const playersData = await Promise.all(
        playerIds.slice(0, 5).map(async (id: string) => {
          const player = await storage.getPlayer(id);
          if (!player) return null;
          
          const shares = sharesMap.get(id) || 0;
          const price = parseFloat(player.lastTradePrice || player.currentPrice || "0");
          const marketCap = shares * price;
          const contestUsage = contestUsageMap.get(id) || { timesUsed: 0, totalEntries: 0, usagePercent: 0 };
          const priceHistory = priceHistoryMap.get(id) || [];
          
          return {
            id: player.id,
            name: `${player.firstName} ${player.lastName}`,
            team: player.team,
            position: player.position,
            shares,
            marketCap,
            price,
            volume: player.volume24h || 0,
            priceChange24h: parseFloat(player.priceChange24h || "0"),
            contestUsagePercent: contestUsage.usagePercent,
            timesUsedInContests: contestUsage.timesUsed,
            priceHistory: priceHistory.map((ph) => ({
              timestamp: ph.timestamp,
              price: ph.price,
            })),
          };
        })
      );

      res.json({ players: playersData.filter(Boolean) });
    } catch (error: any) {
      console.error("[analytics/compare] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Price correlations between players
  app.get("/api/analytics/correlations", async (req, res) => {
    try {
      const allPlayers = await storage.getPlayers();
      const topPlayers = allPlayers
        .filter((p: Player) => p.isActive && p.volume24h && p.volume24h > 0)
        .sort((a: Player, b: Player) => (b.volume24h || 0) - (a.volume24h || 0))
        .slice(0, 20);

      // Calculate correlations based on price change patterns
      const correlations: { player1: string; player2: string; player1Id: string; player2Id: string; correlation: number }[] = [];
      
      for (let i = 0; i < topPlayers.length; i++) {
        for (let j = i + 1; j < topPlayers.length; j++) {
          const p1 = topPlayers[i];
          const p2 = topPlayers[j];
          
          const change1 = parseFloat(p1.priceChange24h || "0");
          const change2 = parseFloat(p2.priceChange24h || "0");
          
          // Correlation based on direction and magnitude similarity
          let correlation = 0;
          if ((change1 > 0 && change2 > 0) || (change1 < 0 && change2 < 0)) {
            // Same direction - higher correlation
            const magnitudeDiff = Math.abs(Math.abs(change1) - Math.abs(change2));
            correlation = Math.max(0.5, 1 - magnitudeDiff / 20);
          } else if (change1 === 0 || change2 === 0) {
            correlation = 0.3;
          } else {
            // Opposite direction - lower correlation
            correlation = Math.max(0, 0.3 - Math.abs(change1 + change2) / 40);
          }
          
          // Team boost: players on same team tend to correlate
          if (p1.team === p2.team) {
            correlation = Math.min(1, correlation + 0.15);
          }
          
          correlations.push({
            player1: `${p1.firstName} ${p1.lastName}`,
            player2: `${p2.firstName} ${p2.lastName}`,
            player1Id: p1.id,
            player2Id: p2.id,
            correlation: Math.round(correlation * 100) / 100,
          });
        }
      }

      // Sort by correlation strength
      correlations.sort((a, b) => b.correlation - a.correlation);
      
      res.json(correlations.slice(0, 20));
    } catch (error: any) {
      console.error("[analytics/correlations] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Initialize players on first run by triggering roster sync
  async function initializePlayers() {
    try {
      const existingPlayers = await storage.getPlayers();
      
      if (existingPlayers.length === 0) {
        console.log("No players found. Triggering roster_sync to fetch real NBA data from MySportsFeeds...");
        const result = await jobScheduler.triggerJob("roster_sync");
        console.log(`Roster sync completed: ${result.recordsProcessed} players loaded, ${result.errorCount} errors`);
      }
    } catch (error: any) {
      console.error("Failed to initialize players:", error.message);
    }
  }

  // Initialize data
  await initializePlayers();

  return httpServer;
}
