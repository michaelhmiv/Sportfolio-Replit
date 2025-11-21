/**
 * Quick script to check what player ID format MySportsFeeds API returns
 */
import { fetchActivePlayers } from '../mysportsfeeds';

async function main() {
  console.log('Fetching players from MySportsFeeds API...\n');
  
  const players = await fetchActivePlayers();
  
  console.log(`Total players: ${players.length}\n`);
  console.log('Sample player IDs from API:');
  console.log('='.repeat(60));
  
  // Show first 15 players
  players.slice(0, 15).forEach((p, i) => {
    console.log(`${(i+1).toString().padStart(2)}. ID: ${String(p.id).padEnd(15)} | ${p.firstName} ${p.lastName} (${p.currentTeam?.abbreviation || 'N/A'})`);
  });
  
  console.log('='.repeat(60));
  
  // Check for any non-numeric IDs
  const nonNumeric = players.filter(p => !/^\d+$/.test(String(p.id)));
  if (nonNumeric.length > 0) {
    console.log(`\n⚠️  Found ${nonNumeric.length} non-numeric IDs:`);
    nonNumeric.slice(0, 10).forEach(p => {
      console.log(`   ${p.id} - ${p.firstName} ${p.lastName}`);
    });
  } else {
    console.log('\n✅ All player IDs are numeric!');
  }
}

main().catch(console.error);
