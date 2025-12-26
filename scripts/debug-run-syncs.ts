import * as fs from 'fs';
import * as path from 'path';

// Manual .env loading - MUST happen before any dynamic imports
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

async function runSyncs() {
    let output = '';
    const log = (...args: any[]) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : a).join(' ');
        console.log(msg);
        output += msg + '\n';
    };

    // Dynamic imports after .env is loaded
    const { syncNFLSchedule } = await import('../server/jobs/sync-nfl-schedule');
    const { syncSchedule } = await import('../server/jobs/sync-schedule');
    const { createContests } = await import('../server/jobs/create-contests');
    const { createNFLContests } = await import('../server/jobs/create-nfl-contests');

    log('--- Running NFL Sync ---');
    try {
        const nflResult = await syncNFLSchedule();
        log('NFL Sync Result:', nflResult);
    } catch (e: any) {
        log('NFL Sync Failed:', e.message || e);
    }

    log('\n--- Running NBA Sync ---');
    try {
        const nbaResult = await syncSchedule();
        log('NBA Sync Result:', nbaResult);
    } catch (e: any) {
        log('NBA Sync Failed:', e.message || e);
    }

    log('\n--- Running NBA Contest Creation ---');
    try {
        const nbaContestResult = await createContests();
        log('NBA Contest Creation Result:', nbaContestResult);
    } catch (e: any) {
        log('NBA Contest Creation Failed:', e.message || e);
    }

    log('\n--- Running NFL Contest Creation ---');
    try {
        const nflContestResult = await createNFLContests();
        log('NFL Contest Creation Result:', nflContestResult);
    } catch (e: any) {
        log('NFL Contest Creation Failed:', e.message || e);
    }

    fs.writeFileSync('sync_debug_results.txt', output, 'utf8');
    log('\nOutput saved to sync_debug_results.txt');
    process.exit(0);
}

runSyncs();
