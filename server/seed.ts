import { db } from "./db";
import { users, players, mining, contests, holdings } from "@shared/schema";
import { sql } from "drizzle-orm";
import { getMockPlayers } from "./mysportsfeeds";

async function seed() {
  console.log("Seeding database...");

  // Create demo user
  const [user] = await db
    .insert(users)
    .values({
      username: "demo",
      balance: "10000.00",
    })
    .onConflictDoUpdate({
      target: users.username,
      set: { balance: "10000.00" },
    })
    .returning();

  console.log("Created user:", user.username);

  // Seed players first (before mining references them)
  const mockPlayers = getMockPlayers();
  for (const player of mockPlayers) {
    await db
      .insert(players)
      .values({
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        team: player.currentTeam?.abbreviation || "UNK",
        position: player.primaryPosition || "G",
        jerseyNumber: player.jerseyNumber || "",
        isActive: true,
        isEligibleForMining: true,
        currentPrice: (10 + Math.random() * 20).toFixed(2),
        volume24h: Math.floor(Math.random() * 10000),
        priceChange24h: ((Math.random() - 0.5) * 10).toFixed(2),
      })
      .onConflictDoUpdate({
        target: players.id,
        set: {
          currentPrice: (10 + Math.random() * 20).toFixed(2),
          volume24h: Math.floor(Math.random() * 10000),
          priceChange24h: ((Math.random() - 0.5) * 10).toFixed(2),
        },
      });
  }

  console.log(`Seeded ${mockPlayers.length} players`);

  // Create mining record (after players exist)
  await db
    .insert(mining)
    .values({
      userId: user.id,
      sharesAccumulated: 1200,
      playerId: "lebron-james",
    })
    .onConflictDoUpdate({
      target: mining.userId,
      set: { sharesAccumulated: 1200, playerId: "lebron-james" },
    });

  console.log("Created mining record");

  // Give user some shares
  const someShares = [
    { playerId: "lebron-james", quantity: 50, avgCost: "12.50" },
    { playerId: "stephen-curry", quantity: 30, avgCost: "15.00" },
    { playerId: "kevin-durant", quantity: 20, avgCost: "18.00" },
  ];

  for (const share of someShares) {
    await db
      .insert(holdings)
      .values({
        userId: user.id,
        assetType: "player",
        assetId: share.playerId,
        quantity: share.quantity,
        avgCostBasis: share.avgCost,
        totalCostBasis: (share.quantity * parseFloat(share.avgCost)).toFixed(2),
      })
      .onConflictDoNothing();
  }

  console.log("Created holdings");

  // Create a demo contest
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(19, 0, 0, 0);

  await db
    .insert(contests)
    .values({
      name: "NBA 50/50 - Tomorrow's Games",
      sport: "NBA",
      contestType: "50/50",
      gameDate: tomorrow,
      status: "open",
      totalSharesEntered: 0,
      totalPrizePool: "0.00",
      entryCount: 0,
      startsAt: tomorrow,
    })
    .onConflictDoNothing();

  console.log("Created contest");

  console.log("✓ Seeding complete!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
