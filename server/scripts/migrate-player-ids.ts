/**
 * Migrate player IDs from slug format to numeric MySportsFeeds IDs
 * 
 * This script:
 * 1. Updates 3 players found in API (LeBron, Paul George, Cameron Thomas)
 * 2. Deletes 6 players not in API (injured/not playing this season)
 */
import { db } from '../db';
import { players, holdings, orders, playerGameStats } from '../../shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('Starting player ID migration...\n');
  
  // Players to migrate (found in API)
  const migrations = [
    { slug: 'lebron-james', numericId: '9158', name: 'LeBron James' },
    { slug: 'paul-george', numericId: '9250', name: 'Paul George' },
    { slug: 'cam-thomas', numericId: '31056', name: 'Cameron Thomas' },
  ];
  
  // Players to delete (not in API - injured or not playing)
  const toDelete = [
    { slug: 'damian-lillard', name: 'Damian Lillard' },
    { slug: 'jayson-tatum', name: 'Jayson Tatum' },
    { slug: 'tyler-herro', name: 'Tyler Herro' },
    { slug: 'tyrese-haliburton', name: 'Tyrese Haliburton' },
    { slug: 'kyrie-irving', name: 'Kyrie Irving' },
    { slug: 'dejounte-murray', name: 'Dejounte Murray' },
  ];
  
  console.log('STEP 1: Migrate player IDs to numeric format');
  console.log('='.repeat(80));
  
  for (const migration of migrations) {
    console.log(`\nMigrating ${migration.name}: ${migration.slug} → ${migration.numericId}`);
    
    try {
      // Update related holdings
      const holdingsResult = await db
        .update(holdings)
        .set({ assetId: migration.numericId })
        .where(eq(holdings.assetId, migration.slug))
        .returning({ id: holdings.id });
      console.log(`  ✅ Updated ${holdingsResult.length} holdings`);
      
      // Update related orders
      const ordersResult = await db
        .update(orders)
        .set({ playerId: migration.numericId })
        .where(eq(orders.playerId, migration.slug))
        .returning({ id: orders.id });
      console.log(`  ✅ Updated ${ordersResult.length} orders`);
      
      // Update player_game_stats (if any)
      const statsResult = await db
        .update(playerGameStats)
        .set({ playerId: migration.numericId })
        .where(eq(playerGameStats.playerId, migration.slug))
        .returning({ id: playerGameStats.id });
      console.log(`  ✅ Updated ${statsResult.length} game stats`);
      
      // Update player record
      const playerResult = await db
        .update(players)
        .set({ id: migration.numericId })
        .where(eq(players.id, migration.slug))
        .returning({ id: players.id });
      console.log(`  ✅ Updated player record to ID ${playerResult[0]?.id}`);
      
    } catch (error: any) {
      console.error(`  ❌ Error migrating ${migration.name}:`, error.message);
    }
  }
  
  console.log('\n\nSTEP 2: Delete players not in API (injured/not playing)');
  console.log('='.repeat(80));
  
  for (const player of toDelete) {
    console.log(`\nDeleting ${player.name} (${player.slug})`);
    
    try {
      // Check for related data
      const relatedHoldings = await db
        .select({ count: holdings.id })
        .from(holdings)
        .where(eq(holdings.assetId, player.slug));
      
      const relatedOrders = await db
        .select({ count: orders.id })
        .from(orders)
        .where(eq(orders.playerId, player.slug));
      
      console.log(`  Holdings: ${relatedHoldings.length}, Orders: ${relatedOrders.length}`);
      
      if (relatedHoldings.length > 0 || relatedOrders.length > 0) {
        console.log(`  ⚠️  Player has related data. Deleting holdings and orders first...`);
        
        // Delete related holdings
        await db.delete(holdings).where(eq(holdings.assetId, player.slug));
        console.log(`  ✅ Deleted ${relatedHoldings.length} holdings`);
        
        // Delete related orders
        await db.delete(orders).where(eq(orders.playerId, player.slug));
        console.log(`  ✅ Deleted ${relatedOrders.length} orders`);
      }
      
      // Delete player
      const result = await db
        .delete(players)
        .where(eq(players.id, player.slug))
        .returning({ id: players.id });
      
      if (result.length > 0) {
        console.log(`  ✅ Deleted player ${player.name}`);
      } else {
        console.log(`  ⚠️  Player not found (may have been deleted already)`);
      }
      
    } catch (error: any) {
      console.error(`  ❌ Error deleting ${player.name}:`, error.message);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Migration complete!');
  console.log('\nNext steps:');
  console.log('1. Run roster sync to populate missing players with numeric IDs');
  console.log('2. Run backfill to cache game logs for all players');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
