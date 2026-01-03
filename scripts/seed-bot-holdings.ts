/**
 * Seed bot holdings with initial shares
 * Gives each bot some shares of high-value players so they can place sell orders
 */

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as schema from '../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const databaseUrl = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error('Error: DEV_DATABASE_URL or DATABASE_URL must be set');
    process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool, { schema });

const SHARES_PER_PLAYER = 100; // Give each bot 100 shares per player
const PLAYERS_PER_BOT = 10; // Give each bot shares in 10 different players

async function seedBotHoldings() {
    console.log('🏦 Seeding bot holdings with initial shares...\n');

    // Get all bot users
    const bots = await db
        .select({ id: schema.users.id, username: schema.users.username })
        .from(schema.users)
        .where(eq(schema.users.isBot, true));

    console.log(`Found ${bots.length} bots\n`);

    // Get top players by currentPrice (as a proxy for value)
    const topPlayers = await db
        .select({
            id: schema.players.id,
            name: sql<string>`${schema.players.firstName} || ' ' || ${schema.players.lastName}`,
            currentPrice: schema.players.currentPrice
        })
        .from(schema.players)
        .where(eq(schema.players.isActive, true))
        .orderBy(sql`${schema.players.currentPrice}::numeric DESC`)
        .limit(50); // Get top 50 players

    console.log(`Found ${topPlayers.length} players to distribute\n`);

    let totalHoldingsCreated = 0;

    for (const bot of bots) {
        // Select random players for this bot
        const shuffled = topPlayers.sort(() => Math.random() - 0.5);
        const selectedPlayers = shuffled.slice(0, PLAYERS_PER_BOT);

        for (const player of selectedPlayers) {
            try {
                // Check if holding already exists
                const existing = await db
                    .select()
                    .from(schema.holdings)
                    .where(
                        and(
                            eq(schema.holdings.userId, bot.id),
                            eq(schema.holdings.assetType, 'player'),
                            eq(schema.holdings.assetId, player.id)
                        )
                    );

                if (existing.length > 0) {
                    // Update existing holding
                    await db
                        .update(schema.holdings)
                        .set({
                            quantity: existing[0].quantity + SHARES_PER_PLAYER,
                            lastUpdated: new Date()
                        })
                        .where(eq(schema.holdings.id, existing[0].id));
                } else {
                    // Create new holding
                    await db.insert(schema.holdings).values({
                        userId: bot.id,
                        assetType: 'player',
                        assetId: player.id,
                        quantity: SHARES_PER_PLAYER,
                        avgCostBasis: player.currentPrice,
                        totalCostBasis: (parseFloat(player.currentPrice) * SHARES_PER_PLAYER).toFixed(2),
                    });
                }

                totalHoldingsCreated++;
            } catch (error: any) {
                console.error(`Failed to create holding for ${bot.username} - ${player.id}:`, error.message);
            }
        }

        console.log(`✅ ${bot.username}: seeded with ${PLAYERS_PER_BOT} player holdings`);
    }

    console.log(`\n✨ Done! Created/updated ${totalHoldingsCreated} holdings for ${bots.length} bots`);

    // Also update player totalShares to reflect new holdings
    console.log('\n📊 Updating player total shares...');

    const playerShares = await db
        .select({
            assetId: schema.holdings.assetId,
            total: sql<number>`SUM(quantity)::int`
        })
        .from(schema.holdings)
        .where(eq(schema.holdings.assetType, 'player'))
        .groupBy(schema.holdings.assetId);

    for (const ps of playerShares) {
        await db
            .update(schema.players)
            .set({ totalShares: ps.total })
            .where(eq(schema.players.id, ps.assetId));
    }

    console.log(`Updated total shares for ${playerShares.length} players`);

    await pool.end();
}

seedBotHoldings().catch(console.error);
