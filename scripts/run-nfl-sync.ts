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

import { syncNFLSchedule } from '../server/jobs/sync-nfl-schedule';

async function run() {
    let output = '';
    const log = (msg: string) => {
        console.log(msg);
        output += msg + '\n';
    };

    log('Running NFL Schedule Sync...\n');

    try {
        const result = await syncNFLSchedule();
        log('\n=== Sync Result ===');
        log(JSON.stringify(result, null, 2));
    } catch (error: any) {
        log('Error: ' + (error.message || error));
        log('Stack: ' + (error.stack || 'none'));
        fs.writeFileSync('nfl_sync_output.txt', output, 'utf8');
        process.exit(1);
    }

    fs.writeFileSync('nfl_sync_output.txt', output, 'utf8');
    log('\nOutput saved to nfl_sync_output.txt');
    process.exit(0);
}

run();
