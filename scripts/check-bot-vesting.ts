import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DEV_DATABASE_URL });

async function checkBotVesting() {
    console.log('=== BOT VESTING ANALYSIS ===\n');

    // Get bot profiles with vesting config
    const bots = await pool.query(`
    SELECT bp.bot_name, bp.vesting_claim_threshold, bp.max_players_to_vest, 
           u.is_premium, u.id as user_id
    FROM bot_profiles bp
    JOIN users u ON bp.user_id = u.id
    WHERE u.is_bot = true AND bp.is_active = true
  `);

    console.log('BOT VESTING CONFIG:');
    for (const bot of bots.rows) {
        const threshold = parseFloat(bot.vesting_claim_threshold);
        const cap = bot.is_premium ? 4800 : 2400;
        const claimAt = Math.floor(threshold * cap);
        const hoursToCliam = claimAt / 100; // 100 shares/hour
        console.log(`  ${bot.bot_name}: threshold=${(threshold * 100).toFixed(0)}% | cap=${cap} | claims at ${claimAt} shares (~${hoursToCliam}h)`);
    }

    // Get current vesting state
    console.log('\nCURRENT VESTING STATE:');
    const vestingState = await pool.query(`
    SELECT u.username, v.shares_accumulated, v.player_id, v.last_accrued_at, v.last_claimed_at
    FROM vesting v
    JOIN users u ON v.user_id = u.id
    WHERE u.is_bot = true
  `);

    const now = new Date();
    for (const v of vestingState.rows) {
        const lastAccrued = new Date(v.last_accrued_at);
        const hoursSinceAccrual = (now.getTime() - lastAccrued.getTime()) / (1000 * 60 * 60);
        const lastClaimed = v.last_claimed_at ? new Date(v.last_claimed_at) : null;
        const hoursSinceClaim = lastClaimed ? (now.getTime() - lastClaimed.getTime()) / (1000 * 60 * 60) : 'never';

        console.log(`  ${v.username}: ${v.shares_accumulated} shares | player: ${v.player_id || 'null'} | lastAccrued: ${hoursSinceAccrual.toFixed(1)}h ago | lastClaim: ${typeof hoursSinceClaim === 'number' ? hoursSinceClaim.toFixed(1) + 'h ago' : hoursSinceClaim}`);
    }

    // Check vesting splits
    console.log('\nVESTING SPLITS:');
    const splits = await pool.query(`
    SELECT u.username, COUNT(vs.id) as split_count, SUM(vs.shares_per_hour) as total_rate
    FROM users u
    LEFT JOIN vesting_splits vs ON u.id = vs.user_id
    WHERE u.is_bot = true
    GROUP BY u.username
  `);

    for (const s of splits.rows) {
        console.log(`  ${s.username}: ${s.split_count} splits | ${s.total_rate || 0} shares/hour total`);
    }

    // Check vesting claims history
    console.log('\nRECENT VESTING CLAIMS:');
    const claims = await pool.query(`
    SELECT u.username, vc.shares_claimed, vc.player_id, vc.claimed_at
    FROM vesting_claims vc
    JOIN users u ON vc.user_id = u.id
    WHERE u.is_bot = true
    ORDER BY vc.claimed_at DESC
    LIMIT 10
  `);

    if (claims.rows.length === 0) {
        console.log('  No claims yet!');
    } else {
        for (const c of claims.rows) {
            const claimed = new Date(c.claimed_at);
            const hoursAgo = (now.getTime() - claimed.getTime()) / (1000 * 60 * 60);
            console.log(`  ${c.username}: ${c.shares_claimed} shares for ${c.player_id} | ${hoursAgo.toFixed(1)}h ago`);
        }
    }

    await pool.end();
}

checkBotVesting().catch(console.error);
