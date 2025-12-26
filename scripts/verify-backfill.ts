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

async function verify() {
    try {
        const { db } = await import('../server/db');
        const { playerGameStats } = await import('@shared/schema');
        const { sql, and, eq } = await import('drizzle-orm');

        console.log("Verifying NFL 2025 stats...");

        const result = await db.select({ count: sql<number>`count(*)` })
            .from(playerGameStats)
            .where(and(
                eq(playerGameStats.sport, 'NFL'),
                eq(playerGameStats.season, '2025-2026-regular')
            ));

        console.log(`Found ${result[0].count} NFL stats for 2025 season.`);

        // Sample check for a key player (e.g., Patrick Mahomes or similar if we knew ID, lets just get one record)
        const sample = await db.select()
            .from(playerGameStats)
            .where(and(
                eq(playerGameStats.sport, 'NFL'),
                eq(playerGameStats.season, '2025-2026-regular')
            ))
            .limit(1);

        if (sample.length > 0) {
            console.log("Sample Record:", JSON.stringify(sample[0], null, 2));
        }

    } catch (e) {
        console.error("Verification failed:", e);
    }
    process.exit(0);
}

verify();
