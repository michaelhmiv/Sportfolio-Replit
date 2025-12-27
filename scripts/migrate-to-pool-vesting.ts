import { db } from "../server/db";
import { vesting, vestingSplits, holdings, vestingClaims, users } from "../shared/schema";
import { eq, gt, and } from "drizzle-orm";

async function migrateToPoolVesting() {
  console.log("[Migration] Starting pool-based vesting migration...");

  const allVestingRecords = await db
    .select()
    .from(vesting)
    .where(gt(vesting.sharesAccumulated, 0));

  console.log(`[Migration] Found ${allVestingRecords.length} users with accumulated shares`);

  let successCount = 0;
  let errorCount = 0;

  for (const vestingRecord of allVestingRecords) {
    try {
      const userId = vestingRecord.userId;
      const sharesAccumulated = vestingRecord.sharesAccumulated;

      if (sharesAccumulated === 0) continue;

      const splits = await db
        .select()
        .from(vestingSplits)
        .where(eq(vestingSplits.userId, userId));

      const usingSplits = splits.length > 0;

      if (usingSplits) {
        const totalRate = splits.reduce((sum, s) => sum + s.sharesPerHour, 0);
        const distributions = splits.map(split => {
          const proportion = split.sharesPerHour / totalRate;
          const shares = Math.floor(proportion * sharesAccumulated);
          return { ...split, shares };
        });

        const remainder = sharesAccumulated - distributions.reduce((sum, d) => sum + d.shares, 0);
        const sortedByRate = [...distributions].sort((a, b) => b.sharesPerHour - a.sharesPerHour);
        for (let i = 0; i < remainder; i++) {
          sortedByRate[i].shares += 1;
        }

        for (const dist of distributions) {
          if (dist.shares === 0) continue;

          const [existingHolding] = await db
            .select()
            .from(holdings)
            .where(and(
              eq(holdings.userId, userId),
              eq(holdings.assetType, "player"),
              eq(holdings.assetId, dist.playerId)
            ));

          if (existingHolding) {
            const newQuantity = existingHolding.quantity + dist.shares;
            const newTotalCost = parseFloat(existingHolding.totalCostBasis);
            const newAvgCost = newQuantity > 0 ? newTotalCost / newQuantity : 0;
            await db
              .update(holdings)
              .set({
                quantity: newQuantity,
                avgCostBasis: newAvgCost.toFixed(4),
                lastUpdated: new Date()
              })
              .where(eq(holdings.id, existingHolding.id));
          } else {
            await db.insert(holdings).values({
              userId,
              assetType: "player",
              assetId: dist.playerId,
              quantity: dist.shares,
              avgCostBasis: "0.0000",
              totalCostBasis: "0.00",
            });
          }

          await db.insert(vestingClaims).values({
            userId,
            playerId: dist.playerId,
            sharesClaimed: dist.shares,
          });
        }

        console.log(`[Migration] User ${userId}: Distributed ${sharesAccumulated} shares across ${splits.length} players`);

      } else if (vestingRecord.playerId) {
        const [existingHolding] = await db
          .select()
          .from(holdings)
          .where(and(
            eq(holdings.userId, userId),
            eq(holdings.assetType, "player"),
            eq(holdings.assetId, vestingRecord.playerId)
          ));

        if (existingHolding) {
          const newQuantity = existingHolding.quantity + sharesAccumulated;
          const newTotalCost = parseFloat(existingHolding.totalCostBasis);
          const newAvgCost = newQuantity > 0 ? newTotalCost / newQuantity : 0;
          await db
            .update(holdings)
            .set({
              quantity: newQuantity,
              avgCostBasis: newAvgCost.toFixed(4),
              lastUpdated: new Date()
            })
            .where(eq(holdings.id, existingHolding.id));
        } else {
          await db.insert(holdings).values({
            userId,
            assetType: "player",
            assetId: vestingRecord.playerId,
            quantity: sharesAccumulated,
            avgCostBasis: "0.0000",
            totalCostBasis: "0.00",
          });
        }

        await db.insert(vestingClaims).values({
          userId,
          playerId: vestingRecord.playerId,
          sharesClaimed: sharesAccumulated,
        });

        console.log(`[Migration] User ${userId}: Claimed ${sharesAccumulated} shares for player ${vestingRecord.playerId}`);

      } else {
        console.log(`[Migration] User ${userId}: Had ${sharesAccumulated} shares but no player selected - shares lost`);
      }

      const now = new Date();
      await db
        .update(vesting)
        .set({
          sharesAccumulated: 0,
          residualMs: 0,
          lastAccruedAt: now,
          lastClaimedAt: now,
          capReachedAt: null,
          updatedAt: now,
        })
        .where(eq(vesting.id, vestingRecord.id));

      await db.delete(vestingSplits).where(eq(vestingSplits.userId, userId));

      successCount++;
    } catch (error) {
      console.error(`[Migration] Error processing user ${vestingRecord.userId}:`, error);
      errorCount++;
    }
  }

  console.log(`[Migration] Complete! Success: ${successCount}, Errors: ${errorCount}`);
}

migrateToPoolVesting()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[Migration] Fatal error:", err);
    process.exit(1);
  });
