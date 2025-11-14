import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { storage } from "./storage";
import { fetchActivePlayers, calculateFantasyPoints, fetchPlayerSeasonStats, fetchPlayerGameLogs } from "./mysportsfeeds";
import type { InsertPlayer } from "@shared/schema";
import { jobScheduler } from "./jobs/scheduler";
import { addClient, removeClient, broadcast } from "./websocket";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Initialize WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    addClient(ws);
    ws.on('close', () => removeClient(ws));
  });

  // Helper: Get user from session (simplified - would use auth middleware in production)
  const getUserId = (req: any): string => {
    // For MVP, we'll create/use a default user
    return "default-user-id";
  };

  // Helper: Ensure default user exists
  async function ensureDefaultUser() {
    let user = await storage.getUserByUsername("demo");
    if (!user) {
      user = await storage.createUser({ username: "demo" });
    }
    return user;
  }

  // Helper: Calculate P&L for holdings
  function calculatePnL(quantity: number, avgCost: string, currentPrice: string) {
    const cost = parseFloat(avgCost);
    const price = parseFloat(currentPrice);
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

          // Update player price
          await storage.upsertPlayer({
            ...player,
            currentPrice: tradePrice.toFixed(2),
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

  // API ROUTES

  // Dashboard
  app.get("/api/dashboard", async (req, res) => {
    try {
      const user = await ensureDefaultUser();
      const allPlayers = await storage.getPlayers();
      const userHoldings = await storage.getUserHoldings(user.id);
      const allContests = await storage.getContests("open");
      const recentTrades = await storage.getRecentTrades(undefined, 10);
      const miningData = await storage.getMining(user.id);

      // Calculate portfolio value
      let portfolioValue = 0;
      for (const holding of userHoldings) {
        if (holding.assetType === "player") {
          const player = await storage.getPlayer(holding.assetId);
          if (player) {
            portfolioValue += holding.quantity * parseFloat(player.currentPrice);
          }
        }
      }

      // Get hot players (top 5 by 24h volume)
      const hotPlayers = allPlayers
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, 5);

      // Get top 3 holdings by value
      const topHoldings = [];
      for (const holding of userHoldings) {
        if (holding.assetType === "player") {
          const player = await storage.getPlayer(holding.assetId);
          if (player) {
            const { currentValue, pnl, pnlPercent } = calculatePnL(
              holding.quantity,
              holding.avgCostBasis,
              player.currentPrice
            );
            topHoldings.push({
              player,
              quantity: holding.quantity,
              value: currentValue,
              pnl,
              pnlPercent,
            });
          }
        }
      }
      topHoldings.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));

      // Get mining data
      let miningPlayer = undefined;
      if (miningData?.playerId) {
        miningPlayer = await storage.getPlayer(miningData.playerId);
      }

      res.json({
        user: {
          balance: user.balance,
          portfolioValue: portfolioValue.toFixed(2),
        },
        hotPlayers,
        mining: miningData ? {
          ...miningData,
          player: miningPlayer,
          capLimit: user.isPremium ? 33600 : 2400,
          sharesPerHour: user.isPremium ? 200 : 100,
        } : null,
        contests: allContests.slice(0, 5),
        recentTrades: await Promise.all(
          recentTrades.map(async (trade) => ({
            ...trade,
            player: await storage.getPlayer(trade.playerId),
          }))
        ),
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
      // Get current time in ET timezone
      const now = new Date();
      const etOffset = -5; // ET is UTC-5 (EST) or UTC-4 (EDT), using -5 for simplicity
      const nowET = new Date(now.getTime() + (etOffset * 60 * 60 * 1000));
      
      // Get start and end of day in ET, then convert back to UTC for database query
      const startOfDayET = new Date(nowET.getFullYear(), nowET.getMonth(), nowET.getDate(), 0, 0, 0);
      const endOfDayET = new Date(nowET.getFullYear(), nowET.getMonth(), nowET.getDate(), 23, 59, 59);
      
      // Convert ET boundaries to UTC for database query
      const startOfDayUTC = new Date(startOfDayET.getTime() - (etOffset * 60 * 60 * 1000));
      const endOfDayUTC = new Date(endOfDayET.getTime() - (etOffset * 60 * 60 * 1000));
      
      const games = await storage.getDailyGames(startOfDayUTC, endOfDayUTC);
      res.json(games);
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
      const stats = await storage.getGameStatsByGameId(gameIdNum);
      
      if (!stats || stats.length === 0) {
        return res.json({
          gameId: gameIdNum,
          homeTeam: {},
          awayTeam: {},
          topPlayers: { home: [], away: [] },
          message: "No stats available yet"
        });
      }

      // Group stats by team and calculate team totals
      const homeStats = stats.filter((s: any) => s.isHomeGame);
      const awayStats = stats.filter((s: any) => !s.isHomeGame);
      
      const calculateTeamTotals = (teamStats: any[]) => ({
        points: teamStats.reduce((sum, s) => sum + s.points, 0),
        rebounds: teamStats.reduce((sum, s) => sum + s.rebounds, 0),
        assists: teamStats.reduce((sum, s) => sum + s.assists, 0),
        steals: teamStats.reduce((sum, s) => sum + s.steals, 0),
        blocks: teamStats.reduce((sum, s) => sum + s.blocks, 0),
      });

      // Get top 3 players by points for each team
      const getTopPlayers = async (teamStats: any[]) => {
        const sorted = teamStats.sort((a, b) => b.points - a.points).slice(0, 3);
        return await Promise.all(sorted.map(async (stat) => ({
          ...stat,
          player: await storage.getPlayer(stat.playerId),
        })));
      };

      res.json({
        gameId: gameIdNum,
        homeTeam: calculateTeamTotals(homeStats),
        awayTeam: calculateTeamTotals(awayStats),
        topPlayers: {
          home: await getTopPlayers(homeStats),
          away: await getTopPlayers(awayStats),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint to manually trigger sync jobs
  app.post("/api/admin/sync/:jobName", async (req, res) => {
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
  app.get("/api/players", async (req, res) => {
    try {
      const { search, team, position } = req.query;
      const players = await storage.getPlayers({
        search: search as string,
        team: team as string,
        position: position as string,
      });
      res.json(players);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Player detail page
  app.get("/api/player/:id", async (req, res) => {
    try {
      const user = await ensureDefaultUser();
      const player = await storage.getPlayer(req.params.id);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const orderBook = await storage.getOrderBook(player.id);
      const recentTrades = await storage.getRecentTrades(player.id, 20);
      const userHolding = await storage.getHolding(user.id, "player", player.id);

      // Mock price history
      const priceHistory = Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        price: (parseFloat(player.currentPrice) + (Math.random() - 0.5) * 2).toFixed(2),
      }));

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
        userBalance: user.balance,
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

      // Fetch season stats from MySportsFeeds
      const seasonStats = await fetchPlayerSeasonStats(player.id);
      
      if (!seasonStats || !seasonStats.stats) {
        return res.json({ 
          player: { firstName: player.firstName, lastName: player.lastName },
          team: { abbreviation: player.team },
          stats: null 
        });
      }

      // Extract and format stats with defensive null checks
      // MySportsFeeds structure: offense, defense, rebounds, fieldGoals, freeThrows, etc.
      const stats = seasonStats.stats || {};
      
      res.json({
        player: seasonStats.player || { firstName: player.firstName, lastName: player.lastName },
        team: seasonStats.team || { abbreviation: player.team },
        stats: {
          gamesPlayed: stats.gamesPlayed || 0,
          // Scoring - MySportsFeeds provides per-game averages
          points: stats.offense?.pts || 0,
          pointsPerGame: stats.offense?.ptsPerGame?.toFixed(1) || "0.0",
          fieldGoalPct: stats.fieldGoals?.fgPct?.toFixed(1) || "0.0",
          threePointPct: stats.fieldGoals?.fg3PtPct?.toFixed(1) || "0.0",
          freeThrowPct: stats.freeThrows?.ftPct?.toFixed(1) || "0.0",
          // Rebounding
          rebounds: stats.rebounds?.reb || 0,
          reboundsPerGame: stats.rebounds?.rebPerGame?.toFixed(1) || "0.0",
          offensiveRebounds: stats.rebounds?.offReb || 0,
          defensiveRebounds: stats.rebounds?.defReb || 0,
          // Playmaking
          assists: stats.offense?.ast || 0,
          assistsPerGame: stats.offense?.astPerGame?.toFixed(1) || "0.0",
          turnovers: stats.offense?.tov || 0,
          // Defense
          steals: stats.defense?.stl || 0,
          blocks: stats.defense?.blk || 0,
          // Minutes
          minutes: stats.miscellaneous?.minSeconds ? Math.floor(stats.miscellaneous.minSeconds / 60) : 0,
          minutesPerGame: stats.miscellaneous?.minSecondsPerGame ? (stats.miscellaneous.minSecondsPerGame / 60).toFixed(1) : "0.0",
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

  // Player recent games (last 5 games)
  app.get("/api/player/:id/recent-games", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Fetch last 5 games from MySportsFeeds
      const gameLogs = await fetchPlayerGameLogs(player.id, 5);
      
      if (!gameLogs || gameLogs.length === 0) {
        return res.json({ recentGames: [] });
      }

      // Format game logs with defensive null checks
      // MySportsFeeds gamelogs structure: stats.{offense, rebounds, fieldGoals, defense, miscellaneous}
      const recentGames = gameLogs
        .filter((log: any) => log && log.game && log.stats) // Filter out invalid entries
        .map((log: any) => {
          const stats = log.stats || {};
          const offense = stats.offense || {};
          const rebounds = stats.rebounds || {};
          const fieldGoals = stats.fieldGoals || {};
          const defense = stats.defense || {};
          return {
            game: {
              id: log.game?.id || 0,
              date: log.game?.startTime || new Date().toISOString(),
              opponent: log.game?.homeTeamAbbreviation === log.team?.abbreviation 
                ? log.game?.awayTeamAbbreviation || "UNK"
                : log.game?.homeTeamAbbreviation || "UNK",
              isHome: log.game?.homeTeamAbbreviation === log.team?.abbreviation,
            },
            stats: {
              points: offense.pts || 0,
              rebounds: rebounds.reb || 0,
              assists: offense.ast || 0,
              steals: defense.stl || 0,
              blocks: defense.blk || 0,
              turnovers: offense.tov || 0,
              fieldGoalsMade: fieldGoals.fgMade || 0,
              fieldGoalsAttempted: fieldGoals.fgAtt || 0,
              threePointersMade: fieldGoals.fg3PtMade || 0,
              minutes: stats.miscellaneous?.minSeconds ? Math.floor(stats.miscellaneous.minSeconds / 60) : 0,
            },
          };
        });

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

  // Place order
  app.post("/api/orders/:playerId", async (req, res) => {
    try {
      const user = await ensureDefaultUser();
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

      // Check balance for buy orders
      if (side === "buy") {
        const price = orderType === "limit" ? parseFloat(limitPrice) : parseFloat(player.currentPrice);
        const cost = quantity * price;
        
        if (parseFloat(user.balance) < cost) {
          return res.status(400).json({ error: "Insufficient balance" });
        }
      }

      // Check holdings for sell orders
      if (side === "sell") {
        const holding = await storage.getHolding(user.id, "player", req.params.playerId);
        if (!holding || holding.quantity < quantity) {
          return res.status(400).json({ error: "Insufficient shares" });
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
  app.post("/api/orders/:orderId/cancel", async (req, res) => {
    try {
      await storage.cancelOrder(req.params.orderId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Portfolio
  app.get("/api/portfolio", async (req, res) => {
    try {
      const user = await ensureDefaultUser();
      const userHoldings = await storage.getUserHoldings(user.id);
      const openOrders = await storage.getUserOrders(user.id, "open");

      let totalValue = 0;
      let totalPnL = 0;
      let totalCost = 0;

      const enrichedHoldings = await Promise.all(
        userHoldings.map(async (holding) => {
          if (holding.assetType === "player") {
            const player = await storage.getPlayer(holding.assetId);
            if (player) {
              const { currentValue, pnl, pnlPercent } = calculatePnL(
                holding.quantity,
                holding.avgCostBasis,
                player.currentPrice
              );
              totalValue += parseFloat(currentValue);
              totalPnL += parseFloat(pnl);
              totalCost += parseFloat(holding.totalCostBasis);

              return { ...holding, player, currentValue, pnl, pnlPercent };
            }
          }
          return holding;
        })
      );

      const enrichedOrders = await Promise.all(
        openOrders.map(async (order) => ({
          ...order,
          player: await storage.getPlayer(order.playerId),
        }))
      );

      const premiumShares = userHoldings.find(h => h.assetType === "premium")?.quantity || 0;

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

  // Start/select mining for a player
  app.post("/api/mining/start", async (req, res) => {
    try {
      const user = await ensureDefaultUser();
      const { playerId } = req.body;

      if (!playerId) {
        return res.status(400).json({ error: "playerId required" });
      }

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      if (!player.isEligibleForMining) {
        return res.status(400).json({ error: "This player is not eligible for mining" });
      }

      // Start mining this player
      await storage.updateMining(user.id, {
        playerId,
      });

      broadcast({ type: "mining", userId: user.id, playerId });

      res.json({ success: true, player });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mining claim
  app.post("/api/mining/claim", async (req, res) => {
    try {
      const user = await ensureDefaultUser();
      const miningData = await storage.getMining(user.id);

      if (!miningData || miningData.sharesAccumulated === 0) {
        return res.status(400).json({ error: "No shares to claim" });
      }

      if (!miningData.playerId) {
        return res.status(400).json({ error: "No player selected for mining" });
      }

      const player = await storage.getPlayer(miningData.playerId);
      if (!player) {
        return res.status(400).json({ error: "Player not found" });
      }

      // Add shares to holdings (cost basis $0)
      const holding = await storage.getHolding(user.id, "player", miningData.playerId);
      if (holding) {
        const newQuantity = holding.quantity + miningData.sharesAccumulated;
        const newTotalCost = parseFloat(holding.totalCostBasis); // Mined shares have $0 cost
        const newAvgCost = newTotalCost / newQuantity;
        await storage.updateHolding(user.id, "player", miningData.playerId, newQuantity, newAvgCost.toFixed(4));
      } else {
        await storage.updateHolding(user.id, "player", miningData.playerId, miningData.sharesAccumulated, "0.0000");
      }

      // Reset mining
      await storage.updateMining(user.id, {
        sharesAccumulated: 0,
        lastClaimedAt: new Date(),
        capReachedAt: null,
      });

      // Broadcast portfolio update
      const updatedUser = await storage.getUser(user.id);
      broadcast({ type: "portfolio", userId: user.id, balance: updatedUser?.balance });
      broadcast({ type: "mining", userId: user.id, claimed: miningData.sharesAccumulated });

      res.json({ 
        success: true, 
        sharesClaimed: miningData.sharesAccumulated,
        player,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Contests
  app.get("/api/contests", async (req, res) => {
    try {
      const user = await ensureDefaultUser();
      const openContests = await storage.getContests("open");
      const myEntries = await storage.getUserContestEntries(user.id);

      const enrichedEntries = await Promise.all(
        myEntries.map(async (entry) => ({
          ...entry,
          contest: await storage.getContest(entry.contestId),
        }))
      );

      res.json({
        openContests,
        myEntries: enrichedEntries,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Contest entry form
  app.get("/api/contest/:id/entry", async (req, res) => {
    try {
      const user = await ensureDefaultUser();
      const contest = await storage.getContest(req.params.id);

      if (!contest) {
        return res.status(404).json({ error: "Contest not found" });
      }

      const userHoldings = await storage.getUserHoldings(user.id);
      const eligiblePlayers = await Promise.all(
        userHoldings
          .filter(h => h.assetType === "player")
          .map(async (holding) => ({
            ...holding,
            player: await storage.getPlayer(holding.assetId),
            isEligible: true, // Simplified - would check game schedule
          }))
      );

      res.json({
        contest: {
          id: contest.id,
          name: contest.name,
          sport: contest.sport,
          startsAt: contest.startsAt,
        },
        eligiblePlayers,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Submit contest entry
  app.post("/api/contest/:id/enter", async (req, res) => {
    try {
      const user = await ensureDefaultUser();
      const contest = await storage.getContest(req.params.id);

      if (!contest) {
        return res.status(404).json({ error: "Contest not found" });
      }

      const { lineup } = req.body;

      if (!lineup || lineup.length === 0) {
        return res.status(400).json({ error: "Lineup cannot be empty" });
      }

      // Calculate total shares
      const totalShares = lineup.reduce((sum: number, item: any) => sum + item.sharesEntered, 0);

      // Create entry
      const entry = await storage.createContestEntry({
        contestId: req.params.id,
        userId: user.id,
        totalSharesEntered: totalShares,
      });

      // Create lineup items
      for (const item of lineup) {
        await storage.createContestLineup({
          entryId: entry.id,
          playerId: item.playerId,
          sharesEntered: item.sharesEntered,
        });

        // Burn shares from holdings
        const holding = await storage.getHolding(user.id, "player", item.playerId);
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

      res.json({ success: true, entry });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Contest leaderboard
  app.get("/api/contest/:id/leaderboard", async (req, res) => {
    try {
      const user = await ensureDefaultUser();
      const contest = await storage.getContest(req.params.id);

      if (!contest) {
        return res.status(404).json({ error: "Contest not found" });
      }

      const entries = await storage.getContestEntries(req.params.id);
      
      // Enrich entries with user and lineup data
      const enrichedEntries = await Promise.all(
        entries.map(async (entry) => ({
          ...entry,
          user: await storage.getUser(entry.userId),
          lineups: [], // Simplified - would fetch actual lineups
        }))
      );

      const myEntry = enrichedEntries.find(e => e.user?.id === user.id);

      res.json({
        contest,
        entries: enrichedEntries,
        myEntry,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Premium redeem
  app.post("/api/premium/redeem", async (req, res) => {
    try {
      const user = await ensureDefaultUser();
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

  // Admin middleware - validates ADMIN_API_TOKEN
  function adminAuth(req: any, res: any, next: any) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const expectedToken = process.env.ADMIN_API_TOKEN;
    
    if (!expectedToken) {
      console.warn('[ADMIN] ADMIN_API_TOKEN not configured - admin endpoints disabled');
      return res.status(503).json({ error: 'Admin endpoints not configured' });
    }
    
    if (token !== expectedToken) {
      const clientIp = req.ip || req.connection.remoteAddress;
      console.warn(`[ADMIN] Unauthorized access attempt from ${clientIp} to ${req.path}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    next();
  }

  // Admin endpoint: Manually trigger cron jobs
  app.post("/api/admin/jobs/trigger", adminAuth, async (req, res) => {
    try {
      const { jobName } = req.body;
      const clientIp = req.ip || req.connection.remoteAddress;
      
      if (!jobName) {
        return res.status(400).json({ error: 'jobName required' });
      }
      
      const validJobs = ['roster_sync', 'schedule_sync', 'stats_sync'];
      if (!validJobs.includes(jobName)) {
        return res.status(400).json({ error: `Invalid jobName. Must be one of: ${validJobs.join(', ')}` });
      }
      
      console.log(`[ADMIN] Job trigger requested by ${clientIp}: ${jobName}`);
      
      const result = await jobScheduler.triggerJob(jobName);
      
      console.log(`[ADMIN] Job ${jobName} completed - ${result.recordsProcessed} records, ${result.errorCount} errors, ${result.requestCount} requests`);
      
      res.json({
        success: true,
        jobName,
        result,
      });
    } catch (error: any) {
      console.error('[ADMIN] Job trigger failed:', error.message);
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

  // Initialize default user and data
  await ensureDefaultUser();
  await initializePlayers();

  return httpServer;
}
