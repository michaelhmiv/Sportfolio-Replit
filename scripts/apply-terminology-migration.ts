import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
    try {
        console.log('--- STARTING DATABASE MIGRATION: MINING -> VESTING ---');

        // 1. Rename Tables (if they exist with old names)
        const tablesResult = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        const tables = tablesResult.rows.map(r => r.table_name);

        if (tables.includes('mining') && !tables.includes('vesting')) {
            console.log('Renaming table mining to vesting...');
            await pool.query('ALTER TABLE mining RENAME TO vesting');
        } else if (tables.includes('mining') && tables.includes('vesting')) {
            console.log('WARNING: Both mining and vesting tables exist. Skipping table rename.');
        }

        if (tables.includes('mining_splits') && !tables.includes('vesting_splits')) {
            console.log('Renaming table mining_splits to vesting_splits...');
            await pool.query('ALTER TABLE mining_splits RENAME TO vesting_splits');
        }

        if (tables.includes('mining_claims') && !tables.includes('vesting_claims')) {
            console.log('Renaming table mining_claims to vesting_claims...');
            await pool.query('ALTER TABLE mining_claims RENAME TO vesting_claims');
        }

        // 2. Rename Columns
        // Users: total_shares_mined -> total_shares_vested
        const userCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
        if (userCols.rows.some(c => c.column_name === 'total_shares_mined')) {
            console.log('Renaming users.total_shares_mined to total_shares_vested...');
            await pool.query('ALTER TABLE users RENAME COLUMN total_shares_mined TO total_shares_vested');
        }

        // Players: is_eligible_for_mining -> is_eligible_for_vesting
        const playerCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'players'");
        if (playerCols.rows.some(c => c.column_name === 'is_eligible_for_mining')) {
            console.log('Renaming players.is_eligible_for_mining to is_eligible_for_vesting...');
            await pool.query('ALTER TABLE players RENAME COLUMN is_eligible_for_mining TO is_eligible_for_vesting');
        }

        // Market Snapshots: shares_mined -> shares_vested
        const marketCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'market_snapshots'");
        if (marketCols.rows.some(c => c.column_name === 'shares_mined')) {
            console.log('Renaming market_snapshots.shares_mined to shares_vested...');
            await pool.query('ALTER TABLE market_snapshots RENAME COLUMN shares_mined TO shares_vested');
        }

        // Bot Profiles: mining_claim_threshold -> vesting_claim_threshold, max_players_to_mine -> max_players_to_vest
        const botCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'bot_profiles'");
        if (botCols.rows.some(c => c.column_name === 'mining_claim_threshold')) {
            console.log('Renaming bot_profiles.mining_claim_threshold to vesting_claim_threshold...');
            await pool.query('ALTER TABLE bot_profiles RENAME COLUMN mining_claim_threshold TO vesting_claim_threshold');
        }
        if (botCols.rows.some(c => c.column_name === 'max_players_to_mine')) {
            console.log('Renaming bot_profiles.max_players_to_mine to max_players_to_vest...');
            await pool.query('ALTER TABLE bot_profiles RENAME COLUMN max_players_to_mine TO max_players_to_vest');
        }

        console.log('--- MIGRATION COMPLETED SUCCESSFULLY ---');
    } catch (e: any) {
        console.error('Migration failed:', e.message);
    } finally {
        await pool.end();
    }
}

migrate();
