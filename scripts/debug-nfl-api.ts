/**
 * Debug NFL API Response
 * Check what data the Ball Don't Lie API returns for today's games
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

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

const API_BASE = "https://api.balldontlie.io/nfl/v1";
const apiKey = process.env.BALLDONTLIE_API_KEY;

async function debugNFLApi() {
    console.log('=== Debugging NFL API Response ===\n');

    if (!apiKey) {
        console.log('ERROR: BALLDONTLIE_API_KEY not set');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    console.log(`Fetching NFL games for today: ${today}\n`);

    try {
        const response = await axios.get(`${API_BASE}/games`, {
            headers: { Authorization: apiKey },
            params: {
                'dates[]': today,
                per_page: 100
            }
        });

        const games = response.data.data || [];
        console.log(`Found ${games.length} games\n`);

        console.log('Full API Response:');
        console.log(JSON.stringify(games, null, 2));

        console.log('\n=== Key Fields ===');
        for (const game of games) {
            console.log(`\nGame ${game.id}: ${game.visitor_team?.abbreviation} @ ${game.home_team?.abbreviation}`);
            console.log(`  date: ${game.date}`);
            console.log(`  time: ${game.time}`);
            console.log(`  status: ${game.status}`);
            console.log(`  week: ${game.week}`);
        }

    } catch (error: any) {
        console.log('API Error:', error.message);
        if (error.response) {
            console.log('Response:', error.response.data);
        }
    }
}

debugNFLApi().catch(console.error);
