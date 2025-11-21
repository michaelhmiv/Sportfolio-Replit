/**
 * Run roster sync to populate all players with numeric MySportsFeeds IDs
 */
import { syncRoster } from '../jobs/sync-roster';

async function main() {
  console.log('Running roster sync to populate all players with numeric IDs...\n');
  
  const result = await syncRoster();
  
  console.log('\n✅ Roster sync complete!');
  console.log(`   API requests: ${result.requestCount}`);
  console.log(`   Players processed: ${result.recordsProcessed}`);
  console.log(`   Errors: ${result.errorCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Roster sync failed:', error);
    process.exit(1);
  });
