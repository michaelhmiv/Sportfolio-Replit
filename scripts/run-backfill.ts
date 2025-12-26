import * as fs from 'fs';
import * as path from 'path';

// Manual .env loading - MUST happen before any dynamic imports
const envPath = path.resolve(process.cwd(), '.env');
console.log(`Loading .env from: ${envPath}`);
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            const val = valueParts.join('=').trim().replace(/^"(.*)"$/, '$1');
            process.env[key.trim()] = val;
        }
    });
    console.log("Environment variables loaded.");
} else {
    console.warn("No .env file found!");
}

async function runBackfillScript() {
    console.log("Importing runBackfill dynamically...");
    try {
        // Dynamic import to ensure process.env is populated first
        const { runBackfill } = await import('../server/backfill-nfl');
        console.log("Starting backfill...");
        const result = await runBackfill();
        console.log("Backfill Result:", JSON.stringify(result, null, 2));
    } catch (error: any) {
        console.error("Backfill Script Failed:", error);
        console.error("Stack:", error.stack);
    }
    process.exit(0);
}

runBackfillScript();
