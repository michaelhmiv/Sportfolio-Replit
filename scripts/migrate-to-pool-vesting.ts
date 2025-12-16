import { db } from "../server/db";
import { mining, miningSplits, holdings, miningClaims, users } from "../shared/schema";
import { eq, gt, and } from "drizzle-orm";

async function migrateToPoolVesting() {
  console.log("[Migration] Starting pool-based vesting migration...");
  
  const allMiningRecords = await db
    .select()
    .from(mining)
    .where(gt(mining.sharesAccumulated, 0));
  
  console.log(`[Migration] Found ${allMiningRecords.length} users with accumulated shares`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const miningRecord of allMiningRecords) {
    try {
      const userId = miningRecord.userId;
      const sharesAccumulated = miningRecord.sharesAccumulated;
      
      if (sharesAccumulated === 0) continue;
      
      const splits = await db
        .select()
        .from(miningSplits)
        .where(eq(miningSplits.userId, userId));
      
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
          
          await db.insert(miningClaims).values({
            userId,
            playerId: dist.playerId,
            sharesClaimed: dist.shares,
          });
        }
        
        console.log(`[Migration] User ${userId}: Distributed ${sharesAccumulated} shares across ${splits.length} players`);
        
      } else if (miningRecord.playerId) {
        const [existingHolding] = await db
          .select()
          .from(holdings)
          .where(and(
            eq(holdings.userId, userId),
            eq(holdings.assetType, "player"),
            eq(holdings.assetId, miningRecord.playerId)
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
            assetId: miningRecord.playerId,
            quantity: sharesAccumulated,
            avgCostBasis: "0.0000",
            totalCostBasis: "0.00",
          });
        }
        
        await db.insert(miningClaims).values({
          userId,
          playerId: miningRecord.playerId,
          sharesClaimed: sharesAccumulated,
        });
        
        console.log(`[Migration] User ${userId}: Claimed ${sharesAccumulated} shares for player ${miningRecord.playerId}`);
        
      } else {
        console.log(`[Migration] User ${userId}: Had ${sharesAccumulated} shares but no player selected - shares lost`);
      }
      
      const now = new Date();
      await db
        .update(mining)
        .set({
          sharesAccumulated: 0,
          residualMs: 0,
          lastAccruedAt: now,
          lastClaimedAt: now,
          capReachedAt: null,
          updatedAt: now,
        })
        .where(eq(mining.id, miningRecord.id));
      
      await db.delete(miningSplits).where(eq(miningSplits.userId, userId));
      
      successCount++;
    } catch (error) {
      console.error(`[Migration] Error processing user ${miningRecord.userId}:`, error);
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
