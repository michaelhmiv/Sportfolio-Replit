
import 'dotenv/config';
import { db } from '../server/db';
import { botProfiles } from '../shared/schema';
import { eq, inArray, notInArray } from 'drizzle-orm';

async function boostBots() {
    console.log('Boosting bot activity levels...');

    // 1. Boost Market Makers, Traders, and Specialists (High Activity)
    // Cooldown: 10s - 60s (Average 35s per action)
    const highActivityRoles = ['market_maker', 'trader', 'contest', 'specialist', 'taker'];

    await db.update(botProfiles)
        .set({
            minActionCooldownMs: 10000, // 10 seconds
            maxActionCooldownMs: 60000, // 60 seconds
            // Also ensure they have budget
            maxDailyOrders: 1000,
            maxDailyVolume: 50000,
        })
        .where(inArray(botProfiles.botRole, highActivityRoles));

    console.log('Boosted high-activity bots (Market Makers, Traders, etc).');

    // 2. Boost Casual Traders (Medium Activity)
    // Cooldown: 1m - 5m (Average 3m per action) -> Was likely slower before
    await db.update(botProfiles)
        .set({
            minActionCooldownMs: 60000,  // 1 minute
            maxActionCooldownMs: 300000, // 5 minutes
        })
        .where(eq(botProfiles.botRole, 'casual'));

    console.log('Boosted casual bots.');

    // 3. Verify specific active bots
    const bots = await db.select({
        name: botProfiles.botName,
        role: botProfiles.botRole,
        min: botProfiles.minActionCooldownMs,
        max: botProfiles.maxActionCooldownMs
    }).from(botProfiles).where(eq(botProfiles.isActive, true));

    console.log('\nActive Bot Configurations:');
    bots.forEach(b => {
        console.log(`- ${b.name} (${b.role}): ${b.min / 1000}s - ${b.max / 1000}s cooldown`);
    });
}

boostBots().catch(console.error);
