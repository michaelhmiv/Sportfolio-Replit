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

async function checkPlayers() {
    try {
        const { db } = await import('../server/db');
        const { players } = await import('@shared/schema');
        const { sql, eq } = await import('drizzle-orm');

        console.log("Checking NFL player count...");
        const result = await db.select({ count: sql<number>`count(*)` })
            .from(players)
            .where(eq(players.sport, 'NFL'));

        console.log(`Current NFL Players: ${result[0].count}`);

    } catch (e) {
        console.error("Check failed:", e);
    }
    process.exit(0);
}

checkPlayers();
