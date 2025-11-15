import { db } from "./db";
import { users, players, mining, contests, holdings, dailyGames } from "@shared/schema";
import { sql, and, gte, lte, asc } from "drizzle-orm";

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
  const mockPlayers = [
    { id: "lebron-james", firstName: "LeBron", lastName: "James", currentTeam: { abbreviation: "LAL" }, primaryPosition: "F", jerseyNumber: "23" },
    { id: "stephen-curry", firstName: "Stephen", lastName: "Curry", currentTeam: { abbreviation: "GSW" }, primaryPosition: "G", jerseyNumber: "30" },
    { id: "kevin-durant", firstName: "Kevin", lastName: "Durant", currentTeam: { abbreviation: "PHX" }, primaryPosition: "F", jerseyNumber: "35" },
    { id: "giannis-antetokounmpo", firstName: "Giannis", lastName: "Antetokounmpo", currentTeam: { abbreviation: "MIL" }, primaryPosition: "F", jerseyNumber: "34" }
  ];
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

  // Seed mock games for tomorrow (before creating contest)
  const now = new Date();
  const tomorrowDate = new Date(now);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  tomorrowDate.setUTCHours(0, 0, 0, 0); // Zero out time components for pure date

  // Create some mock games at different times tomorrow
  const mockGames = [
    {
      gameId: "game-1-tomorrow",
      homeTeam: "LAL",
      awayTeam: "GSW",
      startTime: new Date(Date.UTC(
        tomorrowDate.getUTCFullYear(),
        tomorrowDate.getUTCMonth(),
        tomorrowDate.getUTCDate(),
        22, 0, 0, 0 // 10:00 PM UTC (5:00 PM ET)
      )),
      status: "scheduled" as const,
    },
    {
      gameId: "game-2-tomorrow",
      homeTeam: "MIL",
      awayTeam: "PHX",
      startTime: new Date(Date.UTC(
        tomorrowDate.getUTCFullYear(),
        tomorrowDate.getUTCMonth(),
        tomorrowDate.getUTCDate(),
        23, 30, 0, 0 // 11:30 PM UTC (6:30 PM ET)
      )),
      status: "scheduled" as const,
    },
  ];

  for (const game of mockGames) {
    await db
      .insert(dailyGames)
      .values(game)
      .onConflictDoUpdate({
        target: dailyGames.gameId,
        set: game,
      });
  }

  console.log("Created mock games for tomorrow");
  
  // Create UTC boundaries for tomorrow (00:00:00 to 23:59:59 UTC)
  const startOfTomorrowUTC = new Date(Date.UTC(
    tomorrowDate.getUTCFullYear(),
    tomorrowDate.getUTCMonth(),
    tomorrowDate.getUTCDate(),
    0, 0, 0, 0
  ));
  
  const endOfTomorrowUTC = new Date(Date.UTC(
    tomorrowDate.getUTCFullYear(),
    tomorrowDate.getUTCMonth(),
    tomorrowDate.getUTCDate(),
    23, 59, 59, 999
  ));
  
  // Fetch games for tomorrow to find the earliest start time
  const tomorrowGames = await db
    .select()
    .from(dailyGames)
    .where(and(
      gte(dailyGames.startTime, startOfTomorrowUTC),
      lte(dailyGames.startTime, endOfTomorrowUTC)
    ))
    .orderBy(asc(dailyGames.startTime));
  
  // Set contest start time to earliest game time, or default to 7pm UTC tomorrow if no games
  const defaultStartTime = new Date(Date.UTC(
    tomorrowDate.getUTCFullYear(),
    tomorrowDate.getUTCMonth(),
    tomorrowDate.getUTCDate(),
    19, 0, 0, 0
  ));
  const contestStartTime = tomorrowGames.length > 0 
    ? tomorrowGames[0].startTime 
    : defaultStartTime;

  await db
    .insert(contests)
    .values({
      name: "NBA 50/50 - Tomorrow's Games",
      sport: "NBA",
      contestType: "50/50",
      gameDate: tomorrowDate,
      status: "open",
      totalSharesEntered: 0,
      totalPrizePool: "0.00",
      entryCount: 0,
      startsAt: contestStartTime,
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
