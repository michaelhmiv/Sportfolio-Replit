import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function updateBots() {
    try {
        // Remove targetTiers from all non-market-maker bots so they trade ALL players
        const result = await pool.query(`
      UPDATE bot_profiles 
      SET target_tiers = NULL 
      WHERE bot_role NOT IN ('market_maker')
    `);
        console.log(`Removed targetTiers from ${result.rowCount} bots`);

        // Show current bot configuration
        const bots = await pool.query(`
      SELECT bot_name, bot_role, target_tiers 
      FROM bot_profiles 
      ORDER BY bot_role
    `);
        console.log('\nUpdated bot configurations:');
        bots.rows.forEach(row => {
            console.log(`  ${row.bot_name} (${row.bot_role}): tiers=${row.target_tiers || 'ALL'}`);
        });

    } catch (e: any) {
        console.error('Error:', e.message);
    }
    await pool.end();
}

updateBots();
