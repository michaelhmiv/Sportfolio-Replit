import * as fs from 'fs';
import * as path from 'path';

// Manual .env loading
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim().replace(/^"(.*)"$/, '$1');
        }
    });
}

async function fixNbaSeasons() {
    try {
        const { db } = await import('../server/db');
        const { playerGameStats } = await import('@shared/schema');
        const { sql, and, eq, gt } = await import('drizzle-orm');

        console.log("Checking for mislabeled NBA stats...");

        // 1. Count records that are labeled 2024-2025 but are actually late 2025 (2025-26 season)
        const mislabeled = await db.select({ count: sql<number>`count(*)` })
            .from(playerGameStats)
            .where(and(
                eq(playerGameStats.sport, 'NBA'),
                eq(playerGameStats.season, '2024-2025-regular'),
                gt(playerGameStats.gameDate, new Date('2025-09-01'))
            ));

        console.log(`Found ${mislabeled[0].count} mislabeled records.`);

        if (mislabeled[0].count > 0) {
            console.log("Fixing records...");
            const result = await db.update(playerGameStats)
                .set({ season: '2025-2026-regular' })
                .where(and(
                    eq(playerGameStats.sport, 'NBA'),
                    eq(playerGameStats.season, '2024-2025-regular'),
                    gt(playerGameStats.gameDate, new Date('2025-09-01'))
                ))
                .returning();

            console.log(`Updated ${result.length} records to '2025-2026-regular'.`);
        } else {
            console.log("No records needed fixing.");
        }

    } catch (e) {
        console.error("Fix failed:", e);
    }
    process.exit(0);
}

fixNbaSeasons();
