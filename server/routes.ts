import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { performance } from "node:perf_hooks";
import { storage } from "./storage";
import { db } from "./db";
import { fetchActivePlayers, calculateFantasyPoints } from "./mysportsfeeds";
import type { InsertPlayer, Player, User, Holding } from "@shared/schema";
import { contestLineups, contestEntries, contests, holdings, marketSnapshots, premiumCheckoutSessions, tweetSettings, tweetHistory } from "@shared/schema";
import { sql, eq, desc, and, gte, lte } from "drizzle-orm";
import { jobScheduler } from "./jobs/scheduler";
import { addClient, removeClient, broadcast } from "./websocket";
import { calculateAccrualUpdate } from "@shared/vesting-utils";
import { createContests } from "./jobs/create-contests";
import { calculateContestLeaderboard } from "./contest-scoring";
import { setupAuth, isAuthenticated, optionalAuth } from "./supabaseAuth";
import { getGameDay, getETDayBoundaries, getTodayETBoundaries } from "./lib/time";
import { matchOrders } from "./order-matcher";
import { getOrCompute } from "./cache";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  await setupAuth(app);

  app.get("/api/market/scanners", async (req, res) => {
    try {
      const sport = (req.query.sport as string) || "ALL"; // Default to ALL if not specified
      const scanners = await storage.getFinancialMarketScanners(sport);
      res.json(scanners);
    } catch (error) {
      console.error("Error fetching market scanners:", error);
      res.status(500).json({ error: "Failed to fetch market scanners" });
    }
  });

  // DEBUG: Diagnostic endpoint for player query issues
  app.get("/api/debug/players", async (req, res) => {
    try {
      const sport = (req.query.sport as string) || "ALL";

      // Test 1: Simple count from players table
      const allPlayers = await storage.getPlayersBySport(sport);

      // Test 2: Paginated query (used by main list)
      const paginated = await storage.getPlayersPaginated({ sport, limit: 5 });

      res.json({
        sport,
        simpleQueryCount: allPlayers.length,
        paginatedQueryCount: paginated.total,
        paginatedSample: paginated.players.slice(0, 2).map(p => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, sport: p.sport }))
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  });

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

    const vestingData = await storage.getVesting(userId);
    if (!vestingData) return;

    const now = new Date();
    // Premium users get double rate (200 shares/hour) and double cap (4800)
    const isPremium = user.isPremium || false;
    const capLimit = isPremium ? 4800 : 2400;
    const totalSharesPerHour = isPremium ? 200 : 100;

    // If already at cap, don't accrue more - clear residual time
    if (vestingData.sharesAccumulated >= capLimit) {
      if (!vestingData.capReachedAt || vestingData.residualMs !== 0) {
        await storage.updateVesting(userId, {
          capReachedAt: now,
          residualMs: 0,
          updatedAt: now,
        });
      }
      return;
    }

    // Initialize lastAccruedAt if missing (fallback to updatedAt or now)
    const effectiveLastAccruedAt = vestingData.lastAccruedAt || vestingData.updatedAt || now;

    // If we had to initialize, update the database immediately
    if (!vestingData.lastAccruedAt) {
      await storage.updateVesting(userId, {
        lastAccruedAt: effectiveLastAccruedAt,
        updatedAt: now,
      });
    }

    // Use shared utility to calculate accrual update
    const update = calculateAccrualUpdate({
      sharesAccumulated: vestingData.sharesAccumulated,
      residualMs: vestingData.residualMs || 0,
      lastAccruedAt: effectiveLastAccruedAt,
      sharesPerHour: totalSharesPerHour,
      capLimit,
    }, now);

    // Only update if shares were actually earned
    const sharesEarned = update.sharesAccumulated - vestingData.sharesAccumulated;
    if (sharesEarned > 0) {
      await storage.updateVesting(userId, {
        sharesAccumulated: update.sharesAccumulated,
        residualMs: update.residualMs,
        lastAccruedAt: update.lastAccruedAt,
        updatedAt: now,
        capReachedAt: update.capReached ? now : null,
      });
    }
    // If no shares earned yet, DON'T update anything - leave baseline unchanged
  }

  // Helper: Sync Whop payments for a user and credit premium shares
  async function syncWhopPaymentsForUser(userId: string, userEmail: string): Promise<{
    credited: number;
    revoked: number;
    synced: number;
  }> {
    const result = { credited: 0, revoked: 0, synced: 0 };

    try {
      const apiKey = process.env.WHOP_API_KEY;
      const companyId = process.env.WHOP_COMPANY_ID;

      if (!apiKey) {
        console.log("[WHOP SYNC] No API key configured");
        return result;
      }

      if (!companyId) {
        console.log("[WHOP SYNC] No Company ID configured");
        return result;
      }

      // Use Whop v1 API directly - the SDK uses v5 which returns empty results
      // v1 API: GET https://api.whop.com/api/v1/payments?company_id=...
      const payments: any[] = [];

      try {
        let page = 1;
        let hasMore = true;
        const maxPages = 10; // Safety limit to prevent infinite loops

        while (hasMore && page <= maxPages) {
          const response = await fetch(
            `https://api.whop.com/api/v1/payments?company_id=${companyId}&per_page=100&page=${page}&include=line_items`,
            {
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[WHOP SYNC] API error ${response.status}: ${errorText}`);
            return result;
          }

          const data = await response.json();
          const pagePayments = data.data || [];

          console.log(`[WHOP SYNC] Page ${page}: fetched ${pagePayments.length} payments`);

          // Filter payments matching this user's email (case-insensitive)
          const userPayments = pagePayments.filter((p: any) =>
            p.user?.email?.toLowerCase() === userEmail.toLowerCase()
          );

          payments.push(...userPayments);

          // Check if there are more pages
          hasMore = pagePayments.length === 100;
          page++;
        }

        console.log(`[WHOP SYNC] Found ${payments.length} payments for ${userEmail} (${page - 1} pages)`);
      } catch (err: any) {
        console.error(`[WHOP SYNC] Error querying Whop v1 API:`, err.message);
        return result;
      }

      // Process each payment
      for (const payment of payments) {
        result.synced++;

        const paymentId = payment.id;
        const status = payment.status || "unknown";

        // Check if payment already credited BEFORE any processing
        // Only skip if status is still "paid" (to allow refund/chargeback processing)
        const existingPayment = await storage.getWhopPaymentByPaymentId(paymentId);
        if (existingPayment?.creditedAt && status === "paid") {
          console.log(`[WHOP SYNC] Payment ${paymentId} already credited and still paid, skipping`);
          continue;
        }

        // Extract quantity from line_items first (preferred), fallback to total/5
        let quantity = 0;
        if (payment.line_items && Array.isArray(payment.line_items)) {
          quantity = payment.line_items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
        }
        // Fallback to total/5 if no line_items or zero quantity
        if (quantity === 0) {
          const totalDollars = payment.total || 0;
          quantity = totalDollars >= 5 ? Math.floor(totalDollars / 5) : 0;
        }

        // v1 API returns `total` in dollars for amountCents calculation
        const totalDollars = payment.total || 0;
        const amountCents = Math.round(totalDollars * 100);

        // Skip payments with no value (refunds, zero-dollar invoices)
        if (quantity === 0 && status === "paid") {
          console.log(`[WHOP SYNC] Skipping zero-value payment ${paymentId}`);
          continue;
        }

        // Upsert the payment record
        await storage.upsertWhopPayment({
          paymentId,
          email: userEmail.toLowerCase(),
          userId: null, // Will be set on credit
          quantity,
          amountCents,
          currency: payment.currency || "usd",
          whopStatus: status,
          rawPayload: payment,
        });

        // Re-fetch the payment record after upsert to get latest state
        const currentPayment = await storage.getWhopPaymentByPaymentId(paymentId);

        // Credit paid payments that haven't been credited yet
        // Use atomic credit-first approach: creditWhopPayment returns undefined if already credited
        // This prevents race conditions where multiple syncs credit the same payment
        if (status === "paid" && quantity > 0 && currentPayment &&
          !currentPayment.creditedAt && !currentPayment.revokedAt) {

          // ATOMIC: Credit the payment FIRST - this returns undefined if already credited (race protection)
          const creditedPayment = await storage.creditWhopPayment(paymentId, userId);

          // Only update holdings if we successfully credited (won the race)
          if (creditedPayment) {
            const existingHolding = await storage.getHolding(userId, "premium", "premium");
            const currentQuantity = existingHolding?.quantity || 0;
            const newQuantity = currentQuantity + quantity;

            // Preserve existing avgCost or use $5 default for new holdings
            const currentAvgCost = existingHolding?.avgCostBasis || "5.0000";

            // Update holding with new quantity preserving cost basis
            await storage.updateHolding(userId, "premium", "premium", newQuantity, currentAvgCost);
            result.credited += quantity;
            console.log(`[WHOP SYNC] Credited ${quantity} premium shares to user ${userId} from payment ${paymentId} (${currentQuantity} -> ${newQuantity})`);
          } else {
            console.log(`[WHOP SYNC] Payment ${paymentId} already credited by another process, skipping`);
          }
        }

        // Handle refunds/chargebacks - only if there's a previously credited payment
        if ((status === "refunded" || status === "disputed" || status === "chargedback") &&
          currentPayment && currentPayment.creditedAt && !currentPayment.revokedAt) {
          // Revoke the shares from holdings - preserve avgCost
          const existingHolding = await storage.getHolding(userId, "premium", "premium");
          const currentShares = existingHolding?.quantity || 0;
          const currentAvgCost = existingHolding?.avgCostBasis || "5.0000";

          if (currentShares >= quantity) {
            // User has enough shares to fully revoke
            const newQuantity = currentShares - quantity;
            await storage.updateHolding(userId, "premium", "premium", newQuantity, currentAvgCost);
            await storage.revokeWhopPayment(paymentId, quantity, 0);
            result.revoked += quantity;
            console.log(`[WHOP SYNC] Revoked ${quantity} premium shares from user ${userId} for payment ${paymentId} (${currentShares} -> ${newQuantity})`);
          } else {
            // User doesn't have enough shares - revoke what we can and create liability
            const toRevoke = currentShares;
            const liability = quantity - currentShares;
            await storage.updateHolding(userId, "premium", "premium", 0, currentAvgCost);
            await storage.revokeWhopPayment(paymentId, toRevoke, liability);
            result.revoked += toRevoke;
            console.log(`[WHOP SYNC] Partially revoked ${toRevoke} shares, ${liability} liability for user ${userId}`);
          }
        }
      }

      return result;
    } catch (err: any) {
      console.error("[WHOP SYNC] Error syncing payments:", err.message);
      return result;
    }
  }

  // Ezoic ads.txt redirect
  app.get("/ads.txt", (_req, res) => {
    res.redirect(301, "https://srv.adstxtmanager.com/19390/sportfolio.market");
  });

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

      // Log successful auth
      console.log(`[AUTH:USER] Authenticated user: ${user?.username} (${userId.substring(0, 8)}...)`);

      // Return user data immediately - don't block on Whop sync or vesting
      res.json(user);

      // Fire-and-forget: Trigger vesting accrual in background on login
      if (user) {
        accrueVestingShares(userId).catch(err => console.error('[Vesting] Login accrual error:', err));
      }

      // Fire-and-forget: Trigger Whop sync in background if user has email and sync is requested
      if (user?.email && req.query.sync === "true") {
        syncWhopPaymentsForUser(userId, user.email)
          .then((whopSync) => {
            console.log(`[AUTH] Whop sync for ${user.username}: ${whopSync.credited} credited, ${whopSync.synced} synced`);
          })
          .catch((syncErr: any) => {
            console.error(`[AUTH] Whop sync error:`, syncErr.message);
          });
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Whop payment sync endpoint - manual sync for logged-in users
  app.post("/api/whop/sync", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.email) {
        return res.status(400).json({
          error: "No email associated with your account. Please update your profile with the email used on Whop."
        });
      }

      const result = await syncWhopPaymentsForUser(userId, user.email);

      // Get updated user data
      const updatedUser = await storage.getUser(userId);
      const premiumHolding = await storage.getHolding(userId, "premium", "premium");

      res.json({
        success: true,
        credited: result.credited,
        revoked: result.revoked,
        synced: result.synced,
        premiumShares: premiumHolding?.quantity || 0,
      });
    } catch (error: any) {
      console.error("Error syncing Whop payments:", error);
      res.status(500).json({ error: "Failed to sync with Whop" });
    }
  });

  // Admin endpoint to sync Whop payments for any user
  app.post("/api/admin/whop/sync", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      // Check if user is admin
      if (!currentUser?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { email, username } = req.body;

      if (!email && !username) {
        return res.status(400).json({ error: "Email or username required" });
      }

      // Find target user
      let targetUser;
      if (username) {
        targetUser = await storage.getUserByUsername(username);
      } else if (email) {
        // Find user by email
        const allUsers = await storage.getUsers();
        targetUser = allUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());
      }

      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!targetUser.email) {
        return res.status(400).json({ error: "Target user has no email configured" });
      }

      const result = await syncWhopPaymentsForUser(targetUser.id, targetUser.email);

      // Get updated user data
      const updatedUser = await storage.getUser(targetUser.id);
      const premiumHolding = await storage.getHolding(targetUser.id, "premium", "premium");

      res.json({
        success: true,
        user: {
          id: updatedUser?.id,
          username: updatedUser?.username,
          email: updatedUser?.email,
          premiumShares: premiumHolding?.quantity || 0,
        },
        credited: result.credited,
        revoked: result.revoked,
        synced: result.synced,
      });
    } catch (error: any) {
      console.error("Error in admin Whop sync:", error);
      res.status(500).json({ error: "Failed to sync with Whop" });
    }
  });

  // Admin endpoint to manually grant premium shares
  app.post("/api/admin/premium/grant", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentUser = await storage.getUser(userId);

      // Check if user is admin
      if (!currentUser?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { username, quantity } = req.body;

      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }

      const parsedQuantity = parseInt(quantity, 10);
      if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
        return res.status(400).json({ error: "Quantity must be a positive number" });
      }

      // Find target user by username
      const targetUser = await storage.getUserByUsername(username);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get existing premium holding
      const existingHolding = await storage.getHolding(targetUser.id, "premium", "premium");
      const currentQuantity = existingHolding?.quantity || 0;
      const newQuantity = currentQuantity + parsedQuantity;

      // Preserve existing avgCost or use $5 default for new holdings
      const currentAvgCost = existingHolding?.avgCostBasis || "5.0000";

      // Update holding with new quantity
      await storage.updateHolding(targetUser.id, "premium", "premium", newQuantity, currentAvgCost);

      console.log(`[ADMIN] Granted ${parsedQuantity} premium shares to user ${targetUser.username} (${currentQuantity} -> ${newQuantity}) by admin ${currentUser.username}`);

      res.json({
        success: true,
        user: {
          id: targetUser.id,
          username: targetUser.username,
        },
        granted: parsedQuantity,
        previousQuantity: currentQuantity,
        newQuantity: newQuantity,
      });
    } catch (error: any) {
      console.error("Error granting premium shares:", error);
      res.status(500).json({ error: "Failed to grant premium shares" });
    }
  });

  // Dashboard - Now public for unauthenticated users (with limited data)
  app.get("/api/dashboard", optionalAuth, async (req, res) => {
    try {
      const startTime = performance.now();
      const timings: Record<string, number> = {};

      // Check if user is authenticated
      const isUserAuthenticated = !!req.user;
      const userId = isUserAuthenticated ? getUserId(req) : null;

      // Fetch public data (always available)
      const publicStart = performance.now();
      const [allContests, recentTrades, hotPlayersRaw] = await Promise.all([
        storage.getContests("open"),
        storage.getRecentTrades(undefined, 10),
        storage.getTopPlayersByVolume(5), // Get top 5 players by 24h volume directly from DB
      ]);
      timings.publicData = performance.now() - publicStart;

      // If not authenticated, return public data only
      if (!isUserAuthenticated || !userId) {
        // Collect player IDs from public data
        const playerIds = new Set<string>();
        recentTrades.forEach(t => playerIds.add(t.playerId));

        // Batch fetch needed players
        const batchStart = performance.now();
        const players = await storage.getPlayersByIds(Array.from(playerIds));
        timings.playerBatch = performance.now() - batchStart;
        const playerMap = new Map(players.map(p => [p.id, p]));

        // Enrich hot players (sync operation, no await needed)
        const hotPlayers = hotPlayersRaw.map(enrichPlayerWithMarketValue);

        timings.total = performance.now() - startTime;
        console.log(`[Dashboard] Unauthenticated: ${timings.total.toFixed(0)}ms (public: ${timings.publicData.toFixed(0)}ms, playerBatch: ${timings.playerBatch.toFixed(0)}ms)`);

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

      // Accrue vesting shares in background (fire-and-forget for dashboard speed)
      // Vesting is also triggered by: cron job, vesting modal, claim, redeem, login
      accrueVestingShares(user.id).catch(err => console.error('[Vesting] Background accrual error:', err));

      // Fetch user-specific data in parallel
      const [userHoldings, vestingData, vestingSplits] = await Promise.all([
        storage.getUserHoldings(user.id),
        storage.getVesting(user.id),
        storage.getVestingSplits(user.id),
      ]);

      // Collect all unique player IDs we need to fetch
      const playerIds = new Set<string>();

      // Add holdings player IDs
      userHoldings.forEach(h => {
        if (h.assetType === "player") playerIds.add(h.assetId);
      });

      // Add recent trades player IDs
      recentTrades.forEach(t => playerIds.add(t.playerId));

      // Add vesting player IDs
      if (vestingData?.playerId) playerIds.add(vestingData.playerId);
      vestingSplits.forEach(s => playerIds.add(s.playerId));

      // Parallel fetch: players, ranks, and yesterday's snapshot
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const [players, latestRanks, yesterdaySnapshot] = await Promise.all([
        storage.getPlayersByIds(Array.from(playerIds)),
        storage.getLatestSnapshotRanks(),
        storage.getPortfolioSnapshot(user.id, yesterday),
      ]);
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

      // Enrich hot players with market values (sync operation using pre-fetched data)
      const hotPlayers = hotPlayersRaw.map(enrichPlayerWithMarketValue);

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

      // Get vesting data using pre-fetched players
      let vestingPlayer = undefined;
      let vestingPlayers: Array<{ player: Player | undefined; sharesPerHour: number }> = [];

      if (vestingSplits.length > 0) {
        // Multi-player vesting
        vestingPlayers = vestingSplits.map(split => ({
          player: playerMap.get(split.playerId),
          sharesPerHour: split.sharesPerHour,
        }));
      } else if (vestingData?.playerId) {
        // Legacy single-player vesting
        vestingPlayer = playerMap.get(vestingData.playerId);
      }

      // Get ranks from cached snapshot or calculate real-time
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
        vesting: vestingData ? {
          ...vestingData,
          player: vestingPlayer,
          players: vestingPlayers,
          capLimit: user.isPremium ? 4800 : 2400,
          sharesPerHour: user.isPremium ? 200 : 100,
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
      const sport = (req.query.sport as string) || "NBA";
      const { startOfDay, endOfDay } = getTodayETBoundaries();
      const games = await storage.getDailyGamesBySport(sport, startOfDay, endOfDay);

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
      const sport = (req.query.sport as string) || "NBA";

      // Validate date format (YYYY-MM-DD)
      const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!dateMatch) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
      }

      const { startOfDay, endOfDay } = getETDayBoundaries(date);
      const games = await storage.getDailyGamesBySport(sport, startOfDay, endOfDay);

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

  // Add cash to user balance ($1) - DEVELOPMENT ONLY
  // This endpoint is disabled in production to prevent abuse
  app.post("/api/user/add-cash", isAuthenticated, async (req, res) => {
    try {
      // SECURITY: Disable in production
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: "This feature is disabled in production" });
      }

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

  // Top risers (24h) - players with highest priceChange24h
  app.get("/api/players/spotlight/top-risers", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const sport = (req.query.sport as string) || "NBA";
      const players = await storage.getPlayersBySport(sport);

      // Filter to players with positive price change and actual trade prices
      const risers = players
        .filter(p => p.lastTradePrice && parseFloat(p.priceChange24h) > 0)
        .sort((a, b) => parseFloat(b.priceChange24h) - parseFloat(a.priceChange24h))
        .slice(0, limit)
        .map(p => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          team: p.team,
          position: p.position,
          price: p.currentPrice ? parseFloat(p.currentPrice) : (p.lastTradePrice ? parseFloat(p.lastTradePrice) : null),
          priceChange24h: parseFloat(p.priceChange24h),
        }));

      res.json(risers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Top market cap players
  app.get("/api/players/spotlight/top-market-cap", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const sport = (req.query.sport as string) || "NBA";
      const players = await storage.getPlayersBySport(sport);

      // Filter to players with established market prices and sort by marketCap
      const topMarketCap = players
        .filter(p => (p.lastTradePrice || p.currentPrice) && parseFloat(p.marketCap) > 0)
        .sort((a, b) => parseFloat(b.marketCap) - parseFloat(a.marketCap))
        .slice(0, limit)
        .map(p => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          team: p.team,
          position: p.position,
          price: p.currentPrice ? parseFloat(p.currentPrice) : (p.lastTradePrice ? parseFloat(p.lastTradePrice) : null),
          marketCap: parseFloat(p.marketCap),
          totalShares: p.totalShares,
        }));

      res.json(topMarketCap);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get distinct teams for a sport
  app.get("/api/teams", async (req, res) => {
    try {
      const { sport } = req.query;
      const sportFilter = (sport as string) || "NBA";
      const teams = await storage.getDistinctTeamsBySport(sportFilter);
      res.json(teams);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });



  // Get all players with advanced filtering
  app.get("/api/players", async (req, res) => {
    try {
      const { search, team, position, limit, offset, sortBy, sortOrder, hasBuyOrders, hasSellOrders, teamsPlayingOnDate, sport, isWatchlist } = req.query;

      // Handle watchlist filtering
      // If isWatchlist=true, we need authentication
      let watchlistUserId: string | undefined = undefined;
      if (isWatchlist === 'true') {
        // Support both Passport session user (req.user.id) and raw Auth0 profile (req.user.claims.sub)
        const user = req.user as any;
        const userId = user?.id || user?.claims?.sub;

        if (!userId) {
          // If asking for watchlist but not logged in, return empty
          return res.json({ players: [], total: 0 });
        }
        watchlistUserId = userId;
      }

      // Parse and validate pagination params
      const parsedLimit = limit ? parseInt(limit as string) : 50;
      const parsedOffset = offset ? parseInt(offset as string) : 0;

      // Guard against invalid numeric input (NaN) - allow up to 1000 for redemption modal
      const safeLimit = isNaN(parsedLimit) ? 50 : Math.max(1, Math.min(parsedLimit, 5000));
      const safeOffset = isNaN(parsedOffset) ? 0 : Math.max(0, parsedOffset);

      // Parse sorting and filter params
      const validSortBy = ['price', 'volume', 'change', 'bid', 'ask', 'marketCap', 'sentiment', 'undervalued'];
      const safeSortBy = sortBy && validSortBy.includes(sortBy as string)
        ? sortBy as 'price' | 'volume' | 'change' | 'bid' | 'ask' | 'marketCap' | 'sentiment' | 'undervalued'
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
        sport: sport as string,
        limit: safeLimit,
        offset: safeOffset,
        sortBy: safeSortBy,
        sortOrder: safeSortOrder,
        hasBuyOrders: safeHasBuyOrders,
        hasSellOrders: safeHasSellOrders,
        teamsPlayingOnDate: teamsPlayingFilter,
        watchlistUserId: watchlistUserId
      });

      // PERFORMANCE OPTIMIZATION: Batch fetch order books and season stats for ALL players in parallel
      // This eliminates N+1 query problems:
      // - 50 players × 2 order book queries = 100 queries → 1 query
      // - 50 players × 1 season stats query = 50 queries → 1 query
      const playerIds = playersRaw.map(p => p.id);
      const [orderBooksMap, seasonStatsMap, sentimentMap, avgFantasyPointsMap] = await Promise.all([
        storage.getBatchOrderBooks(playerIds),
        storage.getBatchPlayerSeasonStatsFromLogs(playerIds),
        storage.getBatchSentiment(playerIds),
        storage.getBatchAllTimeAvgFantasyPoints(playerIds), // Same calculation as scanner cards
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

        // Look up pre-fetched sentiment from map
        const sentimentData = sentimentMap.get(player.id) || {
          buyPressure: 50,
          totalVolume24h: 0,
        };

        // Calculate Value Index using ALL-TIME average fantasy points (same as scanner cards)
        // This ensures the numbers match what users see in the carousel
        const LEAGUE_AVG_PE = 0.43;
        const price = parseFloat(player.lastTradePrice || "0");

        // Use all-time avg from a batch query (to be consistent with getFinancialMarketScanners)
        // For now, we'll calculate it inline using the same logic as scanners
        const avgFP = avgFantasyPointsMap.get(player.id) || 0;
        const peRatio = avgFP > 0 ? price / avgFP : 0;
        const valueIndex = LEAGUE_AVG_PE > 0 ? (peRatio / LEAGUE_AVG_PE) * 100 : 0;

        return {
          ...enriched,
          bestBid: orderBookData.bestBid,
          bestAsk: orderBookData.bestAsk,
          bidSize: orderBookData.bidSize,
          askSize: orderBookData.askSize,
          avgFantasyPointsPerGame: seasonStats.avgFantasyPointsPerGame,
          buyPressure: sentimentData.buyPressure,
          valueIndex: valueIndex,
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
      const { playerId, userId, playerSearch, limit, sport } = req.query;

      const parsedLimit = limit ? parseInt(limit as string) : 50;
      const safeLimit = isNaN(parsedLimit) ? 50 : Math.max(1, Math.min(parsedLimit, 200));

      const activity = await storage.getMarketActivity({
        playerId: playerId as string,
        userId: userId as string,
        playerSearch: playerSearch as string,
        limit: safeLimit,
        sport: sport as string,
      });

      // Enrich with player metrics (priceChange24h)
      const uniquePlayerIds = Array.from(new Set(activity.map((a: any) => a.playerId)));
      const players = await storage.getPlayersByIds(uniquePlayerIds);
      const playerMap = new Map(players.map(p => [p.id, p]));

      const enrichedActivity = activity.map((item: any) => {
        const player = playerMap.get(item.playerId);
        return {
          ...item,
          priceChange24h: player?.priceChange24h || "0",
          currentPrice: player?.currentPrice || "0", // Ensure we have the latest reference price
        };
      });

      res.json(enrichedActivity);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // User trade history (for checklist/onboarding and portfolio)
  app.get("/api/trades/history", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const trades = await storage.getMarketActivity({ userId, limit: 100 });
      res.json(trades);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Watch List - Legacy endpoint (returns all player IDs across all watchlists)
  app.get("/api/watchlist", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const playerIds = await storage.getWatchList(userId);
      res.json(playerIds);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Multi-watchlist endpoints
  app.get("/api/watchlists", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const watchlists = await storage.getWatchlists(userId);
      res.json(watchlists);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/watchlists", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { name, color } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Watchlist name is required" });
      }
      const watchlist = await storage.createWatchlist(userId, name, false, color);
      res.json(watchlist);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/watchlists/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, color } = req.body;
      await storage.updateWatchlist(id, { name, color });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/watchlists/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteWatchlist(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get items in a specific watchlist
  app.get("/api/watchlists/:id/items", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const playerIds = await storage.getWatchlistItems(id);
      res.json(playerIds);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add player to watchlist (with optional watchlistId, defaults to Favorites)
  app.post("/api/watchlist/:playerId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { playerId } = req.params;
      const { watchlistId } = req.body || {};
      await storage.addToWatchList(userId, playerId, watchlistId);

      // Get the watchlist name for response
      const watchlistDetails = watchlistId
        ? (await storage.getWatchlists(userId)).find(w => w.id === watchlistId)
        : (await storage.getWatchlists(userId)).find(w => w.isDefault);

      res.json({
        success: true,
        watchlistId: watchlistDetails?.id,
        watchlistName: watchlistDetails?.name || 'Favorites'
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Remove player from watchlist (with optional watchlistId)
  app.delete("/api/watchlist/:playerId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { playerId } = req.params;
      const watchlistId = req.query.watchlistId as string | undefined;
      await storage.removeFromWatchList(userId, playerId, watchlistId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get which watchlists contain a specific player
  app.get("/api/player/:playerId/watchlists", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { playerId } = req.params;
      const watchlistIds = await storage.getPlayerWatchlists(userId, playerId);
      res.json(watchlistIds);
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

      // Parse time range for chart data (1D, 1W, 1M, 1Y)
      const range = (req.query.range as string) || "1D";
      const rangeHours: Record<string, number> = {
        "1D": 24,
        "1W": 24 * 7,
        "1M": 24 * 30,
        "1Y": 24 * 365,
      };
      const hoursBack = rangeHours[range] || 24;
      const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      // Get trades within time range for chart (more trades for longer ranges)
      const tradesLimit = range === "1Y" ? 500 : range === "1M" ? 200 : range === "1W" ? 100 : 50;
      const allTrades = await storage.getRecentTrades(player.id, tradesLimit);

      // Filter trades within time range
      const tradesInRange = allTrades.filter(t => new Date(t.executedAt) >= cutoffDate);

      // Build priceHistory from actual trades (sorted oldest to newest for chart)
      const priceHistory = tradesInRange
        .map(trade => ({
          timestamp: trade.executedAt.toISOString(),
          price: parseFloat(trade.price),
        }))
        .reverse(); // Oldest first for proper chart display

      const orderBook = await storage.getOrderBook(player.id);
      const recentTrades = allTrades.slice(0, 20); // Always show 20 most recent trades in the list
      const userHolding = await storage.getHolding(user.id, "player", player.id);

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
          player: { firstName: player.firstName, lastName: player.lastName, sport: player.sport },
          team: { abbreviation: player.team },
          stats: null
        });
      }

      if (seasonStats.sport === 'NFL') {
        res.json({
          player: { firstName: player.firstName, lastName: player.lastName, sport: player.sport },
          team: { abbreviation: player.team },
          stats: seasonStats
        });
      } else {
        res.json({
          player: { firstName: player.firstName, lastName: player.lastName, sport: player.sport },
          team: { abbreviation: player.team },
          stats: {
            // Pass sport through
            sport: seasonStats.sport,
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
      }
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

  // Get player financial metrics (Gamified Stats)
  app.get("/api/player/:id/financials", async (req, res) => {
    try {
      const metrics = await storage.getPlayerFinancialMetrics(req.params.id);
      res.json(metrics);
    } catch (error: any) {
      console.error("[API] Error fetching financial metrics:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Market order preview - simulates matching without executing
  app.get("/api/orders/:playerId/preview", optionalAuth, async (req, res) => {
    try {
      const { side, quantity: quantityStr } = req.query;
      const quantity = parseInt(quantityStr as string);

      if (!side || (side !== "buy" && side !== "sell")) {
        return res.status(400).json({ error: "Invalid side - must be 'buy' or 'sell'" });
      }

      if (!quantity || quantity <= 0 || isNaN(quantity)) {
        return res.status(400).json({ error: "Invalid quantity" });
      }

      const player = await storage.getPlayer(req.params.playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      const orderBook = await storage.getOrderBook(req.params.playerId);
      const availableOrders = side === "buy" ? orderBook.asks : orderBook.bids;

      // Sort by price: asks ascending (best first), bids descending (best first)
      const sortedOrders = [...availableOrders]
        .filter(o => o.limitPrice && parseFloat(o.limitPrice) > 0 && (o.quantity - o.filledQuantity) > 0)
        .sort((a, b) => {
          const priceA = parseFloat(a.limitPrice!);
          const priceB = parseFloat(b.limitPrice!);
          return side === "buy" ? priceA - priceB : priceB - priceA;
        });

      if (sortedOrders.length === 0) {
        return res.json({
          canFill: false,
          fillableQuantity: 0,
          requestedQuantity: quantity,
          fills: [],
          avgPrice: null,
          totalCost: null,
          message: "No liquidity available"
        });
      }

      // Simulate walking through the book
      let remainingQuantity = quantity;
      const fills: { price: string; quantity: number; total: string }[] = [];
      let totalCost = 0;
      let totalFilled = 0;

      for (const order of sortedOrders) {
        if (remainingQuantity <= 0) break;

        const orderPrice = parseFloat(order.limitPrice!);
        const orderAvailable = order.quantity - order.filledQuantity;
        const fillQuantity = Math.min(remainingQuantity, orderAvailable);
        const fillCost = fillQuantity * orderPrice;

        fills.push({
          price: orderPrice.toFixed(2),
          quantity: fillQuantity,
          total: fillCost.toFixed(2)
        });

        totalCost += fillCost;
        totalFilled += fillQuantity;
        remainingQuantity -= fillQuantity;
      }

      const avgPrice = totalFilled > 0 ? totalCost / totalFilled : 0;
      const bestPrice = sortedOrders.length > 0 ? parseFloat(sortedOrders[0].limitPrice!) : 0;
      const worstFillPrice = fills.length > 0 ? parseFloat(fills[fills.length - 1].price) : 0;

      // Calculate slippage as percentage from best price
      const slippage = bestPrice > 0 && worstFillPrice > 0
        ? Math.abs((worstFillPrice - bestPrice) / bestPrice * 100)
        : 0;

      res.json({
        canFill: totalFilled >= quantity,
        fillableQuantity: totalFilled,
        requestedQuantity: quantity,
        fills,
        avgPrice: avgPrice.toFixed(2),
        totalCost: totalCost.toFixed(2),
        bestPrice: bestPrice.toFixed(2),
        worstFillPrice: worstFillPrice.toFixed(2),
        slippage: slippage.toFixed(2),
        side,
        message: totalFilled < quantity
          ? `Only ${totalFilled} of ${quantity} shares available`
          : `Full fill available at avg $${avgPrice.toFixed(2)}`
      });
    } catch (error: any) {
      console.error("[API] Error generating order preview:", error.message);
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
          // Release all locked resources
          if (side === "sell") {
            await storage.adjustLockQuantity(order.id, 0);
          } else {
            await storage.releaseCashByReference(order.id);
          }
          broadcast({ type: "orderBook", playerId: req.params.playerId });
          return res.status(400).json({ error: "Market order could not be filled - order cancelled" });
        }

        // Market orders should always complete - mark as "filled" even if partial
        // The unfilled portion is effectively cancelled (no more liquidity available)
        await storage.updateOrder(order.id, {
          filledQuantity: filledQty,
          status: "filled", // Always "filled" - unfilled portion is cancelled
        });

        // Release ALL locked resources for market orders (filled portion already executed)
        if (side === "sell") {
          // Release any remaining locked shares (unfilled portion cancelled)
          await storage.adjustLockQuantity(order.id, 0);
        } else {
          // Release locked cash (actual cost already deducted from balance)
          await storage.releaseCashByReference(order.id);
        }

        // Log if there was unfilled quantity
        if (remainingQty > 0) {
          console.log(`[Market Order] Partial fill: ${filledQty}/${quantity} shares filled for order ${order.id}. Unfilled ${remainingQty} shares cancelled due to insufficient liquidity.`);
        }

        // Broadcast real-time updates for order book and trades
        // Calculate VWAP (volume-weighted average price) for the market order
        const vwap = filledQty > 0 ? (totalCost / filledQty).toFixed(2) : lastFillPrice.toFixed(2);

        broadcast({ type: "orderBook", playerId: req.params.playerId });
        broadcast({ type: "trade", playerId: req.params.playerId, quantity: filledQty, price: vwap, userId: user.id });
        // Note: portfolio broadcasts already sent for each party in the fill loop above

        // Return enhanced response for market orders with fill details
        return res.json({
          success: true,
          order: { ...order, filledQuantity: filledQty, status: "filled" },
          marketOrderDetails: {
            requestedQuantity: quantity,
            filledQuantity: filledQty,
            cancelledQuantity: remainingQty,
            avgFillPrice: vwap,
            totalCost: totalCost.toFixed(2),
            message: remainingQty > 0
              ? `Filled ${filledQty} of ${quantity} shares at avg price $${vwap}. ${remainingQty} shares cancelled - insufficient liquidity.`
              : `Filled ${filledQty} shares at avg price $${vwap}`
          }
        });
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
      const userId = getUserId(req);

      // SECURITY: Verify order belongs to authenticated user
      const order = await storage.getOrder(req.params.orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.userId !== userId) {
        console.warn(`[SECURITY] User ${userId} attempted to cancel order ${req.params.orderId} owned by ${order.userId}`);
        return res.status(403).json({ error: "Forbidden - cannot cancel another user's order" });
      }

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

      // Batch fetch bid/ask data for all player holdings
      const playerHoldingIds = holdingsWithData
        .filter((item: any) => item.holding.assetType === "player" && item.player)
        .map((item: any) => item.player.id.toString());
      const orderBooksMap = playerHoldingIds.length > 0
        ? await storage.getBatchOrderBooks(playerHoldingIds)
        : new Map();

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

          // Get bid/ask data for this player
          const orderBookData = orderBooksMap.get(player.id.toString());
          const bestBid = orderBookData?.bestBid || null;
          const bestAsk = orderBookData?.bestAsk || null;
          const bidSize = orderBookData?.bidSize || 0;
          const askSize = orderBookData?.askSize || 0;

          return {
            ...holding,
            player,
            currentValue,
            pnl,
            pnlPercent,
            lockedQuantity,
            availableQuantity: Math.max(0, holding.quantity - lockedQuantity),
            bestBid,
            bestAsk,
            bidSize,
            askSize
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
        typesArray = types.split(',').filter(t => ['vesting', 'market', 'contest'].includes(t));
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

  // Get vesting status with fresh accrual (for vesting modal)
  app.get("/api/vesting/status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Trigger fresh accrual calculation
      await accrueVestingShares(userId);

      // Fetch updated vesting data
      const [vestingData, vestingSplits] = await Promise.all([
        storage.getVesting(userId),
        storage.getVestingSplits(userId),
      ]);

      // Get player data for splits
      const playerIds = new Set<string>();
      if (vestingData?.playerId) playerIds.add(vestingData.playerId);
      vestingSplits.forEach(s => playerIds.add(s.playerId));

      const players = await storage.getPlayersByIds(Array.from(playerIds));
      const playerMap = new Map(players.map(p => [p.id, p]));

      const isPremiumUser = user.premiumExpiresAt && user.premiumExpiresAt > new Date();

      res.json({
        vesting: vestingData ? {
          ...vestingData,
          player: vestingData.playerId ? playerMap.get(vestingData.playerId) : null,
          splits: vestingSplits.map(s => ({
            ...s,
            player: playerMap.get(s.playerId),
          })),
          sharesPerHour: isPremiumUser ? 200 : 100,
          capLimit: isPremiumUser ? 4800 : 2400,
        } : null,
      });
    } catch (error: any) {
      console.error("Error fetching vesting status:", error);
      res.status(500).json({ error: "Failed to fetch vesting status" });
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
        if (!player.isEligibleForVesting) {
          return res.status(400).json({ error: `${player.firstName} ${player.lastName} is not eligible for vesting` });
        }
      }

      const players = playersArray;

      // AUTO-CLAIM: Check if user has unclaimed shares and claim them automatically
      await accrueVestingShares(user.id);
      const currentVesting = await storage.getVesting(user.id);
      let claimedData = null;

      if (currentVesting && currentVesting.sharesAccumulated > 0) {
        const totalAccumulated = currentVesting.sharesAccumulated;
        const splits = await storage.getVestingSplits(user.id);
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

            await storage.createVestingClaim({
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

          await storage.incrementTotalSharesVested(user.id, totalDistributed);
          claimedData = { players: claimedPlayers, totalSharesClaimed: totalDistributed };
        } else {
          // Legacy single-player vesting - use batched queries for consistency
          if (currentVesting.playerId) {
            const [players, holdings] = await Promise.all([
              storage.getPlayersByIds([currentVesting.playerId]),
              storage.getBatchHoldings(user.id, "player", [currentVesting.playerId]),
            ]);

            const player = players[0];
            if (player) {
              const holding = holdings.get(currentVesting.playerId);
              if (holding) {
                const newQuantity = holding.quantity + currentVesting.sharesAccumulated;
                const newTotalCost = parseFloat(holding.totalCostBasis);
                const newAvgCost = newTotalCost / newQuantity;
                await storage.updateHolding(user.id, "player", currentVesting.playerId, newQuantity, newAvgCost.toFixed(4));
              } else {
                await storage.updateHolding(user.id, "player", currentVesting.playerId, currentVesting.sharesAccumulated, "0.0000");
              }

              await storage.incrementTotalSharesVested(user.id, currentVesting.sharesAccumulated);
              await storage.createVestingClaim({
                userId: user.id,
                playerId: currentVesting.playerId,
                sharesClaimed: currentVesting.sharesAccumulated,
              });

              claimedData = {
                sharesClaimed: currentVesting.sharesAccumulated,
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

      // Update vesting state: clear playerId (using splits now), reset timestamps
      const now = new Date();
      await storage.setVestingSplits(user.id, newSplits);
      await storage.updateVesting(user.id, {
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

      const vestingData = await storage.getVesting(user.id);

      if (!vestingData || vestingData.sharesAccumulated === 0) {
        return res.status(400).json({ error: "No shares to claim" });
      }

      // Check if using multi-player vesting (splits)
      const splits = await storage.getVestingSplits(user.id);
      const usingSplits = splits.length > 0;

      if (!usingSplits) {
        // Legacy single-player vesting - use batched queries for consistency
        if (!vestingData.playerId) {
          return res.status(400).json({ error: "No player selected for vesting" });
        }

        const [players, holdings] = await Promise.all([
          storage.getPlayersByIds([vestingData.playerId]),
          storage.getBatchHoldings(user.id, "player", [vestingData.playerId]),
        ]);

        const player = players[0];
        if (!player) {
          return res.status(400).json({ error: "Player not found" });
        }

        // Add shares to holdings (cost basis $0)
        const holding = holdings.get(vestingData.playerId);
        if (holding) {
          const newQuantity = holding.quantity + vestingData.sharesAccumulated;
          const newTotalCost = parseFloat(holding.totalCostBasis); // Vested shares have $0 cost
          const newAvgCost = newTotalCost / newQuantity;
          await storage.updateHolding(user.id, "player", vestingData.playerId, newQuantity, newAvgCost.toFixed(4));
        } else {
          await storage.updateHolding(user.id, "player", vestingData.playerId, vestingData.sharesAccumulated, "0.0000");
        }

        // Increment total shares vested counter
        await storage.incrementTotalSharesVested(user.id, vestingData.sharesAccumulated);

        // Record vesting claim for activity timeline
        await storage.createVestingClaim({
          userId: user.id,
          playerId: vestingData.playerId,
          sharesClaimed: vestingData.sharesAccumulated,
        });

        // Reset vesting
        const now = new Date();
        await storage.updateVesting(user.id, {
          sharesAccumulated: 0,
          lastClaimedAt: now,
          lastAccruedAt: now,
          updatedAt: now,
          residualMs: 0,
          capReachedAt: null,
        });

        broadcast({ type: "portfolio", userId: user.id });
        broadcast({ type: "vesting", userId: user.id, claimed: vestingData.sharesAccumulated });

        return res.json({
          success: true,
          sharesClaimed: vestingData.sharesAccumulated,
          player,
        });
      }

      // Multi-player vesting: distribute shares proportionally
      const totalAccumulated = vestingData.sharesAccumulated;
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

        // Record vesting claim for activity timeline
        await storage.createVestingClaim({
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

      // Increment total shares vested counter
      await storage.incrementTotalSharesVested(user.id, totalDistributed);

      // Reset vesting (keep splits intact)
      const now = new Date();
      await storage.updateVesting(user.id, {
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

  // NEW: Pool-based vesting redeem endpoint
  // Users choose which players to assign their pooled shares to
  app.post("/api/vesting/redeem", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Accrue any final shares before redeeming
      await accrueVestingShares(user.id);

      const vestingData = await storage.getVesting(user.id);
      if (!vestingData || vestingData.sharesAccumulated === 0) {
        return res.status(400).json({ error: "No shares to redeem" });
      }

      // distributions: [{ playerId: string, shares: number }, ...]
      const { distributions } = req.body;

      if (!distributions || !Array.isArray(distributions) || distributions.length === 0) {
        return res.status(400).json({ error: "distributions array required" });
      }

      // Validate total shares don't exceed available
      const totalRequested = distributions.reduce((sum: number, d: any) => sum + (d.shares || 0), 0);
      if (totalRequested > vestingData.sharesAccumulated) {
        return res.status(400).json({
          error: `Cannot redeem ${totalRequested} shares. Only ${vestingData.sharesAccumulated} available.`
        });
      }

      if (totalRequested === 0) {
        return res.status(400).json({ error: "Must redeem at least 1 share" });
      }

      // Validate all players exist and get their data
      const playerIds = distributions.map((d: any) => d.playerId);
      const playersData = await storage.getPlayersByIds(playerIds);
      const playerMap = new Map(playersData.map(p => [p.id, p]));

      for (const dist of distributions) {
        if (!playerMap.has(dist.playerId)) {
          return res.status(400).json({ error: `Player ${dist.playerId} not found` });
        }
        if (!Number.isInteger(dist.shares) || dist.shares < 0) {
          return res.status(400).json({ error: "Shares must be non-negative integers" });
        }
      }

      // Get existing holdings for batch update
      const existingHoldings = await storage.getBatchHoldings(user.id, "player", playerIds);
      const redeemedPlayers = [];
      let totalRedeemed = 0;

      // Distribute shares to players
      for (const dist of distributions) {
        if (dist.shares === 0) continue;

        const player = playerMap.get(dist.playerId);
        const holding = existingHoldings.get(dist.playerId);

        if (holding) {
          const newQuantity = holding.quantity + dist.shares;
          const newTotalCost = parseFloat(holding.totalCostBasis); // Vested shares have $0 cost
          const newAvgCost = newQuantity > 0 ? newTotalCost / newQuantity : 0;
          await storage.updateHolding(user.id, "player", dist.playerId, newQuantity, newAvgCost.toFixed(4));
        } else {
          await storage.updateHolding(user.id, "player", dist.playerId, dist.shares, "0.0000");
        }

        // Record claim for activity timeline
        await storage.createVestingClaim({
          userId: user.id,
          playerId: dist.playerId,
          sharesClaimed: dist.shares,
        });

        redeemedPlayers.push({
          playerId: dist.playerId,
          playerName: `${player!.firstName} ${player!.lastName}`,
          sharesRedeemed: dist.shares,
        });
        totalRedeemed += dist.shares;
      }

      // Increment total shares mined counter
      await storage.incrementTotalSharesVested(user.id, totalRedeemed);

      // Update vesting - subtract redeemed shares, keep remaining in pool
      // CRITICAL: Reset lastAccruedAt to prevent frontend from projecting phantom shares
      const now = new Date();
      const remainingShares = vestingData.sharesAccumulated - totalRedeemed;
      await storage.updateVesting(user.id, {
        sharesAccumulated: remainingShares,
        lastClaimedAt: now,
        updatedAt: now,
        // Reset accrual baseline so frontend projections start fresh
        lastAccruedAt: now,
        // Only reset residualMs on full redemption - preserve fractional progress for partial redemptions
        residualMs: remainingShares === 0 ? 0 : vestingData.residualMs,
        // Only clear cap if we have room now
        capReachedAt: remainingShares < (user.isPremium ? 4800 : 2400) ? null : vestingData.capReachedAt,
      });

      broadcast({ type: "portfolio", userId: user.id });
      broadcast({ type: "vesting", userId: user.id, redeemed: totalRedeemed, remaining: remainingShares });

      res.json({
        success: true,
        totalSharesRedeemed: totalRedeemed,
        remainingShares,
        players: redeemedPlayers,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vesting presets CRUD
  app.get("/api/vesting/presets", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const presets = await storage.getVestingPresets(userId);

      // Enrich with player data
      const allPlayerIds = Array.from(new Set(presets.flatMap(p => p.playerIds)));
      const players = await storage.getPlayersByIds(allPlayerIds);
      const playerMap = new Map(players.map(p => [p.id, p]));

      const enrichedPresets = presets.map(preset => ({
        ...preset,
        players: preset.playerIds.map(id => playerMap.get(id)).filter(Boolean),
      }));

      res.json({ presets: enrichedPresets });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/vesting/presets", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { name, playerIds } = req.body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Preset name required" });
      }

      if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
        return res.status(400).json({ error: "At least one player required" });
      }

      if (playerIds.length > 20) {
        return res.status(400).json({ error: "Maximum 20 players per preset" });
      }

      // Check preset limit
      const existingCount = await storage.countVestingPresets(userId);
      if (existingCount >= 20) {
        return res.status(400).json({ error: "Maximum 20 presets allowed" });
      }

      // Validate all players exist
      const players = await storage.getPlayersByIds(playerIds);
      if (players.length !== playerIds.length) {
        return res.status(400).json({ error: "One or more players not found" });
      }

      const preset = await storage.createVestingPreset({
        userId,
        name: name.trim(),
        playerIds,
      });

      res.json({
        preset: {
          ...preset,
          players,
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/vesting/presets/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const presetId = req.params.id;
      const { name, playerIds } = req.body;

      const existing = await storage.getVestingPreset(presetId);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Preset not found" });
      }

      const updates: any = {};
      if (name && typeof name === "string") {
        updates.name = name.trim();
      }
      if (playerIds && Array.isArray(playerIds)) {
        if (playerIds.length === 0) {
          return res.status(400).json({ error: "At least one player required" });
        }
        if (playerIds.length > 20) {
          return res.status(400).json({ error: "Maximum 20 players per preset" });
        }
        const players = await storage.getPlayersByIds(playerIds);
        if (players.length !== playerIds.length) {
          return res.status(400).json({ error: "One or more players not found" });
        }
        updates.playerIds = playerIds;
      }

      const updated = await storage.updateVestingPreset(presetId, updates);
      if (!updated) {
        return res.status(500).json({ error: "Failed to update preset" });
      }

      const players = await storage.getPlayersByIds(updated.playerIds);
      res.json({
        preset: {
          ...updated,
          players,
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/vesting/presets/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const presetId = req.params.id;

      const existing = await storage.getVestingPreset(presetId);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Preset not found" });
      }

      const deleted = await storage.deleteVestingPreset(presetId);
      res.json({ success: deleted });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's contest entries
  app.get("/api/contests/entries", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const entries = await storage.getUserContestEntries(userId);
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Contests (public - anyone can view, optionalAuth to check for user entries)
  app.get("/api/contests", optionalAuth, async (req: any, res) => {
    try {
      const { date, sport } = req.query;

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
      }

      // Filter by sport if provided (case-insensitive check for "ALL")
      if (sport && typeof sport === 'string' && sport.toUpperCase() !== 'ALL') {
        filteredContests = filteredContests.filter(contest =>
          contest.sport.toUpperCase() === sport.toUpperCase()
        );
      }

      // If user is authenticated, include their entries
      let enrichedEntries: any[] = [];
      if (req.user?.claims?.sub) {
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

      // VALIDATE: Ensure all player IDs are in valid format
      // Accept both pure numeric IDs and sport-prefixed IDs (e.g., nba_12345)
      for (const item of lineup) {
        if (!/^(nba_|nfl_)?\d+$/.test(item.playerId)) {
          return res.status(400).json({
            error: `Invalid player ID format: ${item.playerId}. Expected numeric or sport-prefixed format (e.g., nba_12345).`
          });
        }
      }

      // VALIDATE: Check user has enough available shares BEFORE creating entry
      // Available shares = total - locked (in orders, other contests, vesting)
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

      // VALIDATE: Ensure all player IDs are in valid format
      // Accept both pure numeric IDs and sport-prefixed IDs (e.g., nba_12345)
      for (const item of lineup) {
        if (!/^(nba_|nfl_)?\d+$/.test(item.playerId)) {
          return res.status(400).json({
            error: `Invalid player ID format: ${item.playerId}. Expected numeric or sport-prefixed format (e.g., nba_12345).`
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
  app.get("/api/contest/:id/leaderboard", optionalAuth, async (req: any, res) => {
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
      if (req.user?.claims?.sub) {
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

  // Global leaderboards (public) - cached for 60s
  app.get("/api/leaderboards", async (req, res) => {
    try {
      const category = req.query.category as string || "netWorth";
      const cacheKey = `leaderboard:${category}`;

      // Use cache for all leaderboard categories (60s TTL)
      const result = await getOrCompute(cacheKey, async () => {
        if (category === "sharesVested") {
          const allUsers = await storage.getUsers();
          return {
            category: "sharesVested",
            leaderboard: allUsers
              .sort((a: User, b: User) => b.totalSharesVested - a.totalSharesVested)
              .map((u: User, index: number) => ({
                rank: index + 1,
                userId: u.id,
                username: u.username,
                profileImageUrl: u.profileImageUrl,
                value: u.totalSharesVested,
              })),
          };
        }

        if (category === "marketOrders") {
          const allUsers = await storage.getUsers();
          return {
            category: "marketOrders",
            leaderboard: allUsers
              .sort((a: User, b: User) => b.totalMarketOrders - a.totalMarketOrders)
              .map((u: User, index: number) => ({
                rank: index + 1,
                userId: u.id,
                username: u.username,
                profileImageUrl: u.profileImageUrl,
                value: u.totalMarketOrders,
              })),
          };
        }

        if (category === "cashBalance" || category === "portfolioValue" || category === "netWorth") {
          const [usersWithPortfolio, allUsers] = await Promise.all([
            storage.getAllUsersForRanking(),
            storage.getUsers(),
          ]);
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

          return { category, leaderboard: sortedUsers };
        }

        return null;
      }, 60_000);

      if (result === null) {
        return res.status(400).json({ error: "Invalid category" });
      }

      res.json(result);
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
      const sharesVestedRank = allUsers
        .sort((a: User, b: User) => b.totalSharesVested - a.totalSharesVested)
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
          totalSharesVested: user.totalSharesVested,
          totalMarketOrders: user.totalMarketOrders,
          totalTradesExecuted: user.totalTradesExecuted,
          holdingsCount: enrichedHoldings.length,
        },
        rankings: {
          sharesVested: sharesVestedRank,
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

      // Update user premium status in database
      await storage.updateUserPremiumStatus(user.id, true, expiresAt);

      res.json({
        success: true,
        isPremium: true,
        premiumExpiresAt: expiresAt.toISOString(),
        remainingShares: premiumHolding.quantity - 1
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Premium checkout - create a checkout session and redirect to Whop
  // Note: We use direct checkout URL since Whop API requires higher-tier permissions
  app.post("/api/premium/checkout-session", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { quantity = 1 } = req.body;
      const planId = process.env.WHOP_PLAN_ID;

      if (!planId) {
        return res.status(500).json({ error: "Whop plan ID not configured" });
      }

      const PRICE_PER_SHARE_CENTS = 500; // $5.00 per premium share
      const amountCents = quantity * PRICE_PER_SHARE_CENTS;

      // Create a local checkout session record to track this purchase
      const localSession = await storage.createPremiumCheckoutSession({
        userId: user.id,
        planId,
        quantity,
        amountCents,
      });

      console.log(`[WHOP] Created checkout session ${localSession.id} for user ${userId}, qty: ${quantity}`);

      // Use direct checkout URL - Whop API requires permissions we don't have
      // The webhook will match this session by userId + pending status + recent timestamp
      const directUrl = `https://whop.com/checkout/${planId}/?d2c=true`;

      res.json({
        sessionId: localSession.id,
        purchaseUrl: directUrl,
        planId,
        quantity,
        amountCents,
        email: user.email,
      });
    } catch (error: any) {
      console.error("[WHOP] Error creating checkout session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Dev endpoint to grant premium shares for testing (only in development)
  app.post("/api/dev/grant-premium-shares", async (req, res) => {
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev) {
      return res.status(403).json({ error: "This endpoint is only available in development" });
    }

    try {
      const { userId, quantity = 1 } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Grant premium shares
      const existingHolding = await storage.getHolding(userId, "premium", "premium");
      const currentQuantity = existingHolding?.quantity || 0;
      const newQuantity = currentQuantity + quantity;

      await storage.updateHolding(userId, "premium", "premium", newQuantity, "5.0000");

      console.log(`[DEV] Granted ${quantity} premium shares to user ${userId}. Total: ${newQuantity}`);

      res.json({
        success: true,
        userId,
        quantity,
        totalShares: newQuantity,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get premium status and shares
  app.get("/api/premium/status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const premiumHolding = await storage.getHolding(user.id, "premium", "premium");
      const recentSessions = await storage.getUserPremiumCheckoutSessions(user.id);

      res.json({
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
        premiumShares: premiumHolding?.quantity || 0,
        recentPurchases: recentSessions.filter(s => s.status === "completed").slice(0, 5),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get premium trading data (order book, holdings, etc.)
  app.get("/api/premium/trade", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const premiumHolding = await storage.getHolding(user.id, "premium", "premium");

      // Get order book for premium shares
      const orderBook = await storage.getPremiumOrderBook();

      // Get recent premium trades
      const recentTrades = await storage.getRecentPremiumTrades(10);

      res.json({
        premiumShares: premiumHolding?.quantity || 0,
        userBalance: user.balance,
        orderBook,
        recentTrades,
        isPremium: user.isPremium,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get premium share market data with price history and circulation
  // CRITICAL: Only returns actual trade data - never fabricates prices
  app.get("/api/premium/market-data", async (req, res) => {
    try {
      const period = (req.query.period as string) || "1M";

      // Calculate time range based on period
      let startDate: Date;
      const now = new Date();
      switch (period) {
        case "1D":
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "1W":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "1M":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "3M":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case "ALL":
        default:
          startDate = new Date("2020-01-01");
          break;
      }

      // Get premium trades within the time range
      const trades = await storage.getPremiumTradesInRange(startDate, now);

      // Get order book for current bid/ask (only show if orders exist)
      const orderBook = await storage.getPremiumOrderBook();
      const bestBid = orderBook.bids.length > 0
        ? orderBook.bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price))[0]
        : null;
      const bestAsk = orderBook.asks.length > 0
        ? orderBook.asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0]
        : null;

      // Get total circulation (sum of all premium holdings) - ensure it's a number
      const circulationRaw = await storage.getTotalPremiumCirculation();
      const circulation = typeof circulationRaw === 'string' ? parseInt(circulationRaw, 10) : (circulationRaw || 0);

      // Get last trade price (market value is ONLY the most recent trade)
      const lastTrade = trades.length > 0 ? trades[0] : null;
      const lastTradePrice = lastTrade ? parseFloat(lastTrade.price) : null;

      // Build price history from actual trades only
      const priceHistory = trades.map(trade => ({
        timestamp: trade.executedAt,
        price: parseFloat(trade.price),
        volume: trade.quantity,
      })).reverse(); // Oldest first for charting

      res.json({
        // Only show prices that are based on actual data - all numbers, no strings
        lastTradePrice, // null if no trades, number otherwise
        bestBid: bestBid ? { price: parseFloat(bestBid.price), quantity: bestBid.quantity } : null,
        bestAsk: bestAsk ? { price: parseFloat(bestAsk.price), quantity: bestAsk.quantity } : null,
        circulation,
        priceHistory,
        totalTrades: trades.length,
        period,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Place premium share order
  app.post("/api/premium/orders", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { side, quantity, orderType, limitPrice } = req.body;

      if (!side || !quantity || !orderType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (quantity <= 0) {
        return res.status(400).json({ error: "Quantity must be positive" });
      }

      const price = orderType === "limit" ? parseFloat(limitPrice) : 5.00;
      const orderValue = quantity * price;

      if (side === "buy") {
        // Check balance
        if (parseFloat(user.balance) < orderValue) {
          return res.status(400).json({ error: "Insufficient balance" });
        }

        // Lock funds
        await storage.updateUserBalance(user.id, (parseFloat(user.balance) - orderValue).toFixed(2));

        // Create buy order
        const order = await storage.createPremiumOrder({
          userId: user.id,
          side: "buy",
          quantity,
          price: price.toFixed(4),
          orderType,
          status: "open",
        });

        // Try to match with existing sell orders
        await matchPremiumOrders();

        res.json({ success: true, order });
      } else if (side === "sell") {
        // Check holdings
        const premiumHolding = await storage.getHolding(user.id, "premium", "premium");
        if (!premiumHolding || premiumHolding.quantity < quantity) {
          return res.status(400).json({ error: "Insufficient shares" });
        }

        // Lock shares
        await storage.updateHolding(user.id, "premium", "premium", premiumHolding.quantity - quantity, "5.0000");

        // Create sell order
        const order = await storage.createPremiumOrder({
          userId: user.id,
          side: "sell",
          quantity,
          price: price.toFixed(4),
          orderType,
          status: "open",
        });

        // Try to match with existing buy orders
        await matchPremiumOrders();

        res.json({ success: true, order });
      } else {
        return res.status(400).json({ error: "Invalid order side" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Helper function to match premium orders
  async function matchPremiumOrders() {
    const orderBook = await storage.getPremiumOrderBook();

    for (const bid of orderBook.bids) {
      for (const ask of orderBook.asks) {
        // Match if bid price >= ask price
        if (parseFloat(bid.price) >= parseFloat(ask.price)) {
          const matchQuantity = Math.min(bid.quantity, ask.quantity);
          const matchPrice = ask.price; // Use ask price for execution
          const matchValue = matchQuantity * parseFloat(matchPrice);

          // Execute trade - transfer shares to buyer
          const buyerHolding = await storage.getHolding(bid.userId, "premium", "premium");
          const buyerQuantity = buyerHolding?.quantity || 0;
          await storage.updateHolding(bid.userId, "premium", "premium", buyerQuantity + matchQuantity, "5.0000");

          // Give seller the cash
          const seller = await storage.getUser(ask.userId);
          if (seller) {
            await storage.updateUserBalance(seller.id, (parseFloat(seller.balance) + matchValue).toFixed(2));
          }

          // Update or remove orders
          await storage.updatePremiumOrderQuantity(bid.orderId, bid.quantity - matchQuantity);
          await storage.updatePremiumOrderQuantity(ask.orderId, ask.quantity - matchQuantity);

          // Record trade with order IDs for full audit trail
          await storage.createPremiumTrade({
            buyerId: bid.userId,
            sellerId: ask.userId,
            buyOrderId: bid.orderId,
            sellOrderId: ask.orderId,
            quantity: matchQuantity,
            price: matchPrice,
          });

          console.log(`[PREMIUM] Matched ${matchQuantity} shares at $${matchPrice}`);
        }
      }
    }
  }

  // Whop webhook handler - receives payment.succeeded events
  // Uses official @whop/sdk for signature verification
  // NOTE: We use req.rawBody captured by express.json verify callback in index.ts
  // This ensures we get the original raw body before JSON parsing
  app.post("/api/webhooks/whop", async (req, res) => {
    try {
      const webhookSecret = process.env.WHOP_WEBHOOK_SECRET;

      // Use rawBody captured by express.json verify callback (see index.ts)
      // This is the actual raw body string needed for signature verification
      const rawBodyBuffer = (req as any).rawBody;
      const rawBody = Buffer.isBuffer(rawBodyBuffer) ? rawBodyBuffer.toString('utf8') : String(rawBodyBuffer || '');

      // Log that we received a request (helps diagnose if webhook is reaching us)
      console.log("[WHOP WEBHOOK] ========== INCOMING REQUEST ==========");
      console.log("[WHOP WEBHOOK] Timestamp:", new Date().toISOString());
      console.log("[WHOP WEBHOOK] Method:", req.method);
      console.log("[WHOP WEBHOOK] Content-Type:", req.headers['content-type']);
      console.log("[WHOP WEBHOOK] Body length:", rawBody.length);
      console.log("[WHOP WEBHOOK] Has webhook-id header:", !!req.headers['webhook-id']);
      console.log("[WHOP WEBHOOK] Has webhook-timestamp header:", !!req.headers['webhook-timestamp']);
      console.log("[WHOP WEBHOOK] Has webhook-signature header:", !!req.headers['webhook-signature']);
      console.log("[WHOP WEBHOOK] Raw body preview:", rawBody.length > 200 ? rawBody.substring(0, 200) + "..." : rawBody);

      if (!webhookSecret) {
        console.error("[WHOP WEBHOOK] WHOP_WEBHOOK_SECRET not configured");
        return res.status(500).json({ error: "Webhook secret not configured" });
      }

      // Enhanced debugging - log all relevant info
      const webhookId = req.headers['webhook-id'] as string;
      const webhookTimestamp = req.headers['webhook-timestamp'] as string;
      const webhookSignature = req.headers['webhook-signature'] as string;

      console.log("[WHOP WEBHOOK] === VERIFICATION DEBUG ===");
      console.log("[WHOP WEBHOOK] webhook-id:", webhookId);
      console.log("[WHOP WEBHOOK] webhook-timestamp:", webhookTimestamp);
      console.log("[WHOP WEBHOOK] webhook-signature:", webhookSignature);
      console.log("[WHOP WEBHOOK] secret first 10 chars:", webhookSecret.substring(0, 10) + "...");
      console.log("[WHOP WEBHOOK] secret length:", webhookSecret.length);
      console.log("[WHOP WEBHOOK] body first 100 chars:", rawBody.substring(0, 100));

      // Convert Express headers to plain object for SDK (filter out undefined values)
      const headersObj: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) {
          headersObj[key] = Array.isArray(value) ? value[0] : value;
        }
      }

      let payload: any;
      let verificationSucceeded = false;

      // Standard Webhooks spec requires the secret to be base64 encoded with "whsec_" prefix removed
      // But Whop uses "ws_" prefix - let's try multiple formats
      const keyFormats = [
        { name: "base64-of-raw", key: Buffer.from(webhookSecret).toString('base64') },
        { name: "raw-secret", key: webhookSecret },
        { name: "base64-without-prefix", key: Buffer.from(webhookSecret.replace(/^ws_/, '')).toString('base64') },
        { name: "raw-without-prefix", key: webhookSecret.replace(/^ws_/, '') },
      ];

      // Try using standardwebhooks library directly first for better error messages
      try {
        const { Webhook } = await import("standardwebhooks");

        for (const format of keyFormats) {
          try {
            const wh = new Webhook(format.key);
            // standardwebhooks expects specific header format
            const headers = {
              "webhook-id": webhookId,
              "webhook-timestamp": webhookTimestamp,
              "webhook-signature": webhookSignature,
            };
            wh.verify(rawBody, headers);
            payload = JSON.parse(rawBody);
            console.log(`[WHOP WEBHOOK] standardwebhooks verification SUCCESS with ${format.name}!`);
            verificationSucceeded = true;
            break;
          } catch (err: any) {
            console.log(`[WHOP WEBHOOK] standardwebhooks ${format.name} failed:`, err.message);
          }
        }
      } catch (importErr: any) {
        console.log("[WHOP WEBHOOK] Could not import standardwebhooks:", importErr.message);
      }

      // If standardwebhooks didn't work, try Whop SDK
      if (!verificationSucceeded) {
        const { Whop } = await import("@whop/sdk");

        for (const format of keyFormats) {
          try {
            const whopsdk = new Whop({
              apiKey: process.env.WHOP_API_KEY,
              webhookKey: format.key,
            });

            payload = whopsdk.webhooks.unwrap(rawBody, { headers: headersObj });
            console.log(`[WHOP WEBHOOK] SDK verification SUCCESS with ${format.name}! Event type:`, payload.type);
            verificationSucceeded = true;
            break;
          } catch (err: any) {
            console.log(`[WHOP WEBHOOK] SDK ${format.name} failed:`, err.message);
          }
        }
      }

      if (!verificationSucceeded) {
        console.error("[WHOP WEBHOOK] === ALL VERIFICATION ATTEMPTS FAILED ===");
        console.error("[WHOP WEBHOOK] This is likely a secret mismatch issue.");
        console.error("[WHOP WEBHOOK] Please verify WHOP_WEBHOOK_SECRET matches the secret in Whop dashboard.");

        // Return 401 immediately - do not process unverified payloads
        return res.status(401).json({ error: "Webhook signature verification failed" });
      }

      // Log the full payload structure for debugging
      console.log("[WHOP WEBHOOK] === PAYLOAD DEBUG ===");
      console.log("[WHOP WEBHOOK] Full payload keys:", Object.keys(payload));
      console.log("[WHOP WEBHOOK] payload.action:", payload.action);
      console.log("[WHOP WEBHOOK] payload.type:", payload.type);
      if (payload.data) {
        console.log("[WHOP WEBHOOK] payload.data keys:", Object.keys(payload.data));
        console.log("[WHOP WEBHOOK] payload.data.id:", payload.data.id);
        console.log("[WHOP WEBHOOK] payload.data.checkout_id:", payload.data.checkout_id);
        console.log("[WHOP WEBHOOK] payload.data.plan_id:", payload.data.plan_id);
        console.log("[WHOP WEBHOOK] payload.data.user_id:", payload.data.user_id);
        console.log("[WHOP WEBHOOK] payload.data.final_amount:", payload.data.final_amount);
        console.log("[WHOP WEBHOOK] payload.data.metadata:", JSON.stringify(payload.data.metadata));
      }

      // Whop uses "action" field, not "type" - check both for compatibility
      const eventAction = payload.action || payload.type;
      console.log("[WHOP WEBHOOK] Event action:", eventAction);

      // Handle payment.succeeded event
      if (eventAction === "payment.succeeded") {
        const payment = payload.data;
        const receiptId = payment.id;

        console.log("[WHOP WEBHOOK] Processing payment.succeeded for:", receiptId);

        // Check if payment already exists in whop_payments table
        const existingPayment = await storage.getWhopPaymentByPaymentId(receiptId);
        if (existingPayment?.creditedAt) {
          console.log("[WHOP WEBHOOK] Payment already credited:", receiptId);
          return res.json({ success: true, message: "Already credited" });
        }

        // Get all available identifiers from webhook payload
        const metadata = payment.metadata || {};
        const sessionId = metadata.sessionId;
        const metadataUserId = metadata.userId;
        const checkoutId = payment.checkout_id;
        const whopUserId = payment.user_id;
        const planId = payment.plan_id;
        const finalAmount = payment.final_amount;

        console.log("[WHOP WEBHOOK] === USER IDENTIFICATION ===");
        console.log("[WHOP WEBHOOK] metadata.sessionId:", sessionId);
        console.log("[WHOP WEBHOOK] metadata.userId:", metadataUserId);
        console.log("[WHOP WEBHOOK] payment.checkout_id:", checkoutId);
        console.log("[WHOP WEBHOOK] payment.user_id:", whopUserId);
        console.log("[WHOP WEBHOOK] payment.plan_id:", planId);
        console.log("[WHOP WEBHOOK] payment.final_amount:", finalAmount);

        let userId: string | null = null;
        let quantity = 1;
        let matchedSession: any = null;

        // Method 1: Try to find user by our session ID from metadata
        if (sessionId) {
          console.log("[WHOP WEBHOOK] Method 1: Trying session ID lookup:", sessionId);
          const session = await storage.getPremiumCheckoutSession(sessionId);
          if (session && session.status === "pending") {
            matchedSession = session;
            userId = session.userId;
            quantity = session.quantity;
            console.log("[WHOP WEBHOOK] Method 1 SUCCESS: Found user via sessionId:", userId);
          }
        }

        // Method 2: Find most recent pending checkout session (any plan, within last 2 hours)
        // This is the primary fallback when using direct checkout URL
        if (!userId) {
          console.log("[WHOP WEBHOOK] Method 2: Trying pending session lookup...");
          const pendingSessions = await storage.getPendingPremiumCheckoutSessions();
          console.log("[WHOP WEBHOOK] Found", pendingSessions.length, "pending sessions");

          // Sort by createdAt descending (most recent first)
          const sortedSessions = pendingSessions.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

          // Log all pending sessions for debugging
          for (const s of sortedSessions.slice(0, 5)) {
            console.log(`[WHOP WEBHOOK]   - Session ${s.id}: user=${s.userId}, plan=${s.planId}, qty=${s.quantity}, created=${s.createdAt}`);
          }

          // Find most recent session within last 2 hours
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

          // First try to match by planId if available
          let matchingSession = sortedSessions.find(s =>
            s.planId === planId &&
            new Date(s.createdAt) > twoHoursAgo
          );

          // If no plan match, use the most recent pending session
          if (!matchingSession && sortedSessions.length > 0) {
            matchingSession = sortedSessions.find(s => new Date(s.createdAt) > twoHoursAgo);
            if (matchingSession) {
              console.log("[WHOP WEBHOOK] Method 2: No plan match, using most recent pending session");
            }
          }

          if (matchingSession) {
            matchedSession = matchingSession;
            userId = matchingSession.userId;
            quantity = matchingSession.quantity;
            console.log("[WHOP WEBHOOK] Method 2 SUCCESS: Found user via pending session:", userId, "qty:", quantity);
          }
        }

        // Method 3: Calculate quantity from amount as fallback
        if (!quantity || quantity < 1) {
          if (finalAmount && finalAmount >= 500) {
            quantity = Math.floor(finalAmount / 500);
            console.log("[WHOP WEBHOOK] Method 3: Inferred quantity from amount:", quantity);
          } else {
            quantity = 1; // Default to 1
          }
        }

        if (!userId) {
          console.error("[WHOP WEBHOOK] === USER IDENTIFICATION FAILED ===");
          console.error("[WHOP WEBHOOK] Could not identify user for payment:", receiptId);
          console.error("[WHOP WEBHOOK] Full payment data:", JSON.stringify(payment, null, 2));
          // Still return 200 to acknowledge receipt (Whop will retry otherwise)
          return res.status(200).json({ success: false, message: "User not found" });
        }

        // Get user's email for whop_payments record
        const user = await storage.getUser(userId);
        const userEmail = user?.email || payment.user?.email || "unknown@webhook.local";

        // ATOMIC APPROACH: First record payment to whop_payments table
        // This ensures both webhook AND sync use the same atomic crediting system
        console.log("[WHOP WEBHOOK] Recording payment to whop_payments table...");
        await storage.upsertWhopPayment({
          paymentId: receiptId,
          email: userEmail,
          userId: null, // Will be set by creditWhopPayment
          quantity: quantity,
          amountCents: finalAmount || (quantity * 500),
          currency: "usd",
          whopStatus: "paid",
          rawPayload: payment,
        });

        // ATOMIC CREDIT: Use creditWhopPayment which has WHERE creditedAt IS NULL
        // This prevents double-crediting even if webhook and sync race
        const creditedPayment = await storage.creditWhopPayment(receiptId, userId);

        if (!creditedPayment) {
          // Payment already credited by another process (sync or duplicate webhook)
          console.log("[WHOP WEBHOOK] Payment already credited by another process, skipping:", receiptId);
          return res.json({ success: true, message: "Already credited" });
        }

        // Mark the matched session as completed
        if (matchedSession) {
          await storage.completePremiumCheckoutSession(matchedSession.id, receiptId);
          console.log("[WHOP WEBHOOK] Marked session", matchedSession.id, "as completed");
        }

        // Credit premium shares to user - only happens if we won the atomic credit race
        const existingHolding = await storage.getHolding(userId, "premium", "premium");
        const currentQuantity = existingHolding?.quantity || 0;
        const newQuantity = currentQuantity + quantity;

        // Update holding with new quantity (avgCost is $5 per share)
        await storage.updateHolding(userId, "premium", "premium", newQuantity, "5.0000");

        console.log(`[WHOP WEBHOOK] === SUCCESS ===`);
        console.log(`[WHOP WEBHOOK] Credited ${quantity} premium shares to user ${userId}`);
        console.log(`[WHOP WEBHOOK] Previous balance: ${currentQuantity}, New balance: ${newQuantity}`);

        // Broadcast portfolio update via WebSocket
        broadcast({ type: "portfolio" });

        return res.json({ success: true, quantity, userId, newBalance: newQuantity });
      }

      // Other event types - just acknowledge
      console.log("[WHOP WEBHOOK] Unhandled event type:", eventAction);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[WHOP WEBHOOK] Error processing webhook:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin middleware - validates ADMIN_API_TOKEN (for external cron) OR isAdmin flag (for logged-in users)
  async function adminAuth(req: any, res: any, next: any) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const expectedToken = process.env.ADMIN_API_TOKEN;

    // Check 1: Token-based auth (for external cron jobs - using ADMIN_API_TOKEN)
    if (token && expectedToken && token === expectedToken) {
      return next();
    }

    // Check 2: Dev mode bypass - allow all admin requests in development
    const isDev = process.env.NODE_ENV === 'development';
    const bypassAuth = process.env.DEV_BYPASS_AUTH !== 'false';

    if (isDev && bypassAuth) {
      console.log(`[ADMIN] Dev bypass: ${req.method} ${req.path}`);
      return next();
    }

    // Check 3: Verify Supabase JWT token and check isAdmin flag
    if (token) {
      try {
        // Import supabase admin client to verify JWT tokens
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (supabaseUrl && supabaseServiceRoleKey) {
          const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
          });

          const { data: { user: supabaseUser }, error } = await supabaseAdmin.auth.getUser(token);

          if (!error && supabaseUser) {
            // Token is valid, check if user is admin
            const user = await storage.getUser(supabaseUser.id);
            if (user?.isAdmin) {
              // Set req.user for downstream use
              req.user = {
                claims: {
                  sub: supabaseUser.id,
                  email: supabaseUser.email,
                }
              };
              console.log(`[ADMIN] Admin access granted for user ${supabaseUser.email} (${supabaseUser.id})`);
              return next();
            } else {
              console.warn(`[ADMIN] User ${supabaseUser.email} is not an admin (isAdmin: ${user?.isAdmin})`);
            }
          } else if (error) {
            console.log(`[ADMIN] Supabase token verification failed: ${error.message}`);
          }
        }
      } catch (error: any) {
        console.error('[ADMIN] Error verifying Supabase token:', error.message);
      }
    }

    // Check 4: Fallback - check if req.user is already set (from session or other middleware)
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
      // All scheduled job types in the system
      const jobTypes = [
        'roster_sync',
        'sync_player_game_logs',
        'schedule_sync',
        'stats_sync',
        'stats_sync_live',
        'create_contests',
        'update_contest_statuses',
        'settle_contests',
        'daily_snapshot',
        'weekly_roundup',
        'bot_engine',
      ];

      const [users, players, allContests, recentLogs, latestJobLogs] = await Promise.all([
        storage.getUsers(),
        storage.getPlayers(),
        storage.getContests(),
        storage.getRecentJobLogs(undefined, 200), // For today's API request count
        storage.getLatestJobLogPerType(jobTypes),
      ]);
      const openContests = allContests.filter((c: any) => c.status === 'open').length;
      const liveContests = allContests.filter((c: any) => c.status === 'live').length;
      const completedContests = allContests.filter((c: any) => c.status === 'completed').length;

      // Get today's API request count from recent logs
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayLogs = recentLogs.filter((log: any) => {
        const logDate = new Date(log.scheduledFor);
        logDate.setHours(0, 0, 0, 0);
        return logDate.getTime() === today.getTime();
      });
      const apiRequestsToday = todayLogs.reduce((sum: number, log: any) => sum + (log.requestCount || 0), 0);

      // Build last job runs from the per-type query results
      const lastJobRuns = jobTypes.map(jobName => {
        const lastLog = latestJobLogs.get(jobName);
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

  // Admin endpoint: Manually credit premium shares (for failed Whop purchases)
  app.post("/api/admin/premium/credit", adminAuth, async (req, res) => {
    try {
      const { userId, quantity, reason } = req.body;

      if (!userId || !quantity) {
        return res.status(400).json({ error: "userId and quantity are required" });
      }

      const qty = parseInt(quantity);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: "quantity must be a positive integer" });
      }

      // Verify user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get current premium holding
      const existingHolding = await storage.getHolding(userId, "premium", "premium");
      const currentQuantity = existingHolding?.quantity || 0;
      const newQuantity = currentQuantity + qty;

      // Credit the shares
      await storage.updateHolding(userId, "premium", "premium", newQuantity, "5.0000");

      console.log(`[ADMIN] Manually credited ${qty} premium shares to user ${userId}. Reason: ${reason || 'No reason provided'}`);

      // Broadcast portfolio update
      broadcast({ type: "portfolio" });

      res.json({
        success: true,
        userId,
        previousQuantity: currentQuantity,
        creditedQuantity: qty,
        newQuantity,
        reason: reason || 'Manual credit by admin',
      });
    } catch (error: any) {
      console.error('[ADMIN] Failed to credit premium shares:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: View pending premium checkout sessions
  app.get("/api/admin/premium/sessions", adminAuth, async (req, res) => {
    try {
      const sessions = await db
        .select()
        .from(premiumCheckoutSessions)
        .orderBy(desc(premiumCheckoutSessions.createdAt))
        .limit(50);

      res.json({ sessions });
    } catch (error: any) {
      console.error('[ADMIN] Failed to get premium sessions:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ========== TWEET MANAGEMENT ENDPOINTS ==========

  // Admin endpoint: Get tweet settings and history
  app.get("/api/admin/tweets", adminAuth, async (req, res) => {
    try {
      // Get settings (create default if none exist)
      let settings = await db.select().from(tweetSettings).limit(1);
      if (settings.length === 0) {
        const [newSettings] = await db.insert(tweetSettings).values({
          enabled: false,
        }).returning();
        settings = [newSettings];
      }

      // Get recent tweet history
      const history = await db
        .select()
        .from(tweetHistory)
        .orderBy(desc(tweetHistory.createdAt))
        .limit(20);

      // Get service status
      const { twitterService } = await import("./services/twitter");
      const { perplexityService } = await import("./services/perplexity");

      res.json({
        settings: settings[0],
        history,
        status: {
          twitter: twitterService.getStatus(),
          perplexity: perplexityService.getStatus(),
        },
      });
    } catch (error: any) {
      console.error('[ADMIN] Failed to get tweet settings:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: Update tweet settings
  app.patch("/api/admin/tweets/settings", adminAuth, async (req, res) => {
    try {
      const { enabled, promptTemplate, includeRisers, includeVolume, includeMarketCap, maxPlayers } = req.body;

      // Get existing settings or create new
      let settings = await db.select().from(tweetSettings).limit(1);

      if (settings.length === 0) {
        const [newSettings] = await db.insert(tweetSettings).values({
          enabled: enabled ?? false,
          promptTemplate: promptTemplate ?? undefined,
          includeRisers: includeRisers ?? true,
          includeVolume: includeVolume ?? true,
          includeMarketCap: includeMarketCap ?? true,
          maxPlayers: maxPlayers ?? 3,
        }).returning();
        return res.json({ settings: newSettings });
      }

      // Update existing settings
      const updates: any = { updatedAt: new Date() };
      if (enabled !== undefined) updates.enabled = enabled;
      if (promptTemplate !== undefined) updates.promptTemplate = promptTemplate;
      if (includeRisers !== undefined) updates.includeRisers = includeRisers;
      if (includeVolume !== undefined) updates.includeVolume = includeVolume;
      if (includeMarketCap !== undefined) updates.includeMarketCap = includeMarketCap;
      if (maxPlayers !== undefined) updates.maxPlayers = maxPlayers;

      const [updated] = await db
        .update(tweetSettings)
        .set(updates)
        .where(eq(tweetSettings.id, settings[0].id))
        .returning();

      res.json({ settings: updated });
    } catch (error: any) {
      console.error('[ADMIN] Failed to update tweet settings:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: Verify Twitter credentials
  app.post("/api/admin/tweets/verify", adminAuth, async (req, res) => {
    try {
      const { twitterService } = await import("./services/twitter");

      if (!twitterService.isReady()) {
        return res.status(400).json({
          success: false,
          error: "Twitter service not configured - missing API credentials",
          status: twitterService.getStatus(),
        });
      }

      const verification = await twitterService.verifyCredentials();

      if (verification.valid) {
        res.json({
          success: true,
          username: verification.username,
          message: `Successfully connected to Twitter account @${verification.username}`,
        });
      } else {
        res.status(400).json({
          success: false,
          error: verification.error,
          hint: "Make sure your Twitter Developer App has 'Read and Write' permissions enabled, and you've regenerated your Access Token & Secret AFTER enabling those permissions.",
        });
      }
    } catch (error: any) {
      console.error('[ADMIN] Failed to verify Twitter credentials:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: Preview a tweet (without posting)
  app.post("/api/admin/tweets/preview", adminAuth, async (req, res) => {
    try {
      const { generateTweetPreview } = await import("./jobs/daily-tweet");
      const preview = await generateTweetPreview();

      res.json({
        content: preview.content,
        playerData: preview.playerData,
        aiSummary: preview.aiSummary,
        characterCount: preview.content.length,
        settings: preview.settings,
      });
    } catch (error: any) {
      console.error('[ADMIN] Failed to generate tweet preview:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: Post a tweet immediately (supports custom content)
  app.post("/api/admin/tweets/post", adminAuth, async (req, res) => {
    try {
      const { customContent } = req.body;

      if (customContent) {
        // Post custom content directly
        const { twitterService } = await import("./services/twitter");
        const tweetResult = await twitterService.postTweet(customContent);

        if (tweetResult.success) {
          // Log to tweet history
          await db.insert(tweetHistory).values({
            content: customContent,
            tweetId: tweetResult.tweetId,
            status: "posted",
          });

          res.json({
            success: true,
            tweetId: tweetResult.tweetId,
            content: customContent,
          });
        } else {
          res.status(400).json({
            success: false,
            error: tweetResult.error,
          });
        }
      } else {
        // Use daily tweet generator
        const { postDailyTweet } = await import("./jobs/daily-tweet");
        const result = await postDailyTweet();

        if (result.success) {
          res.json({
            success: true,
            tweetId: result.tweetId,
            content: result.content,
          });
        } else {
          res.status(400).json({
            success: false,
            error: result.error,
          });
        }
      }
    } catch (error: any) {
      console.error('[ADMIN] Failed to post tweet:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: Test Twitter connection
  app.post("/api/admin/tweets/test-twitter", adminAuth, async (req, res) => {
    try {
      const { twitterService } = await import("./services/twitter");
      const result = await twitterService.verifyCredentials();
      res.json(result);
    } catch (error: any) {
      console.error('[ADMIN] Failed to test Twitter:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: Test Perplexity connection
  app.post("/api/admin/tweets/test-perplexity", adminAuth, async (req, res) => {
    try {
      const { perplexityService } = await import("./services/perplexity");
      const result = await perplexityService.testConnection();
      res.json(result);
    } catch (error: any) {
      console.error('[ADMIN] Failed to test Perplexity:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: Get market context for custom tweet drafting
  app.get("/api/admin/tweets/context", adminAuth, async (req, res) => {
    try {
      const { getFullMarketContext } = await import("./jobs/daily-tweet");
      const context = await getFullMarketContext();
      res.json(context);
    } catch (error: any) {
      console.error('[ADMIN] Failed to get market context:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint: Draft a custom tweet using Perplexity
  app.post("/api/admin/tweets/draft", adminAuth, async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const { draftCustomTweet } = await import("./jobs/daily-tweet");
      const result = await draftCustomTweet(prompt);

      if (result.success) {
        res.json({
          success: true,
          content: result.content,
          context: result.context,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error: any) {
      console.error('[ADMIN] Failed to draft custom tweet:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Cron endpoint: Daily tweet (for external cron services like cron-job.net)
  app.post("/api/cron/daily-tweet", adminAuth, async (req, res) => {
    try {
      console.log("[CRON] Daily tweet triggered");
      const { postDailyTweet } = await import("./jobs/daily-tweet");
      const result = await postDailyTweet();

      if (result.success) {
        console.log("[CRON] Daily tweet posted successfully:", result.tweetId);
        res.json({
          success: true,
          tweetId: result.tweetId,
        });
      } else {
        console.warn("[CRON] Daily tweet failed:", result.error);
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error: any) {
      console.error("[CRON] Daily tweet error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ========== END TWEET MANAGEMENT ==========

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
          sharesVested: shareEconomy.totalSharesVested,
          sharesBurned: shareEconomy.totalSharesBurned,
          totalShares: shareEconomy.totalSharesInEconomy,
          periodsharesVested: shareEconomy.periodsharesVested,
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
          sharesVested: s.sharesVested,
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
