/**
 * Map slug-based player IDs to their numeric MySportsFeeds IDs
 */
import { fetchActivePlayers } from '../mysportsfeeds';

async function main() {
  console.log('Fetching all players from MySportsFeeds API...\n');
  
  const apiPlayers = await fetchActivePlayers();
  
  // Slug-based players we need to find
  const slugPlayers = [
    { slug: 'cam-thomas', firstName: 'Cam', lastName: 'Thomas' },
    { slug: 'damian-lillard', firstName: 'Damian', lastName: 'Lillard' },
    { slug: 'dejounte-murray', firstName: 'Dejounte', lastName: 'Murray' },
    { slug: 'jayson-tatum', firstName: 'Jayson', lastName: 'Tatum' },
    { slug: 'kyrie-irving', firstName: 'Kyrie', lastName: 'Irving' },
    { slug: 'lebron-james', firstName: 'LeBron', lastName: 'James' },
    { slug: 'paul-george', firstName: 'Paul', lastName: 'George' },
    { slug: 'tyler-herro', firstName: 'Tyler', lastName: 'Herro' },
    { slug: 'tyrese-haliburton', firstName: 'Tyrese', lastName: 'Haliburton' },
  ];
  
  console.log('Mapping slug IDs to numeric IDs:\n');
  console.log('='.repeat(80));
  
  const mappings: Array<{slug: string, numericId: string | null, firstName: string, lastName: string}> = [];
  
  for (const slugPlayer of slugPlayers) {
    const apiPlayer = apiPlayers.find(p => 
      p.firstName.toLowerCase() === slugPlayer.firstName.toLowerCase() &&
      p.lastName.toLowerCase() === slugPlayer.lastName.toLowerCase()
    );
    
    if (apiPlayer) {
      console.log(`✅ ${slugPlayer.firstName} ${slugPlayer.lastName}: ${slugPlayer.slug} → ${apiPlayer.id}`);
      mappings.push({
        slug: slugPlayer.slug,
        numericId: apiPlayer.id,
        firstName: slugPlayer.firstName,
        lastName: slugPlayer.lastName,
      });
    } else {
      console.log(`❌ ${slugPlayer.firstName} ${slugPlayer.lastName}: ${slugPlayer.slug} → NOT FOUND IN API`);
      mappings.push({
        slug: slugPlayer.slug,
        numericId: null,
        firstName: slugPlayer.firstName,
        lastName: slugPlayer.lastName,
      });
    }
  }
  
  console.log('='.repeat(80));
  console.log(`\nTotal: ${mappings.filter(m => m.numericId).length}/${mappings.length} players found in API\n`);
  
  // Output SQL migration statements
  console.log('\nSQL UPDATE statements to migrate player IDs:\n');
  console.log('-- WARNING: This will update player IDs and related foreign keys');
  console.log('-- Run in a transaction and backup first!\n');
  
  for (const mapping of mappings) {
    if (mapping.numericId) {
      console.log(`-- ${mapping.firstName} ${mapping.lastName}`);
      console.log(`UPDATE holdings SET asset_id = '${mapping.numericId}' WHERE asset_id = '${mapping.slug}';`);
      console.log(`UPDATE orders SET player_id = '${mapping.numericId}' WHERE player_id = '${mapping.slug}';`);
      console.log(`UPDATE player_game_stats SET player_id = '${mapping.numericId}' WHERE player_id = '${mapping.slug}';`);
      console.log(`UPDATE players SET id = '${mapping.numericId}' WHERE id = '${mapping.slug}';\n`);
    }
  }
}

main().catch(console.error);
