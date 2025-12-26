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

const API_KEY = process.env.BALLDONTLIE_API_KEY;
const API_BASE = 'https://api.balldontlie.io/nfl/v1';

if (!API_KEY) {
    console.error('BALLDONTLIE_API_KEY not set');
    process.exit(1);
}

async function testNFLAPI() {
    console.log('=== NFL API Direct Test ===\n');
    console.log('API Key present:', API_KEY ? 'Yes' : 'No');
    console.log('API Key length:', API_KEY?.length || 0);

    let output = '=== NFL API Direct Test Results ===\n';
    output += `Timestamp: ${new Date().toISOString()}\n\n`;

    try {
        // Test 1: Get games for 2025 season Week 17
        console.log('\n--- Fetching Week 17 games (2025 Season) ---');
        const week17_2025Response = await axios.get(`${API_BASE}/games`, {
            headers: { 'Authorization': API_KEY },
            params: {
                'seasons[]': 2025,
                'weeks[]': 17,
                'per_page': 50
            }
        });

        const week17_2025Games = week17_2025Response.data.data || [];
        console.log(`2025 Season Week 17: Found ${week17_2025Games.length} games`);

        output += `2025 Season Week 17 Games: ${week17_2025Games.length}\n`;
        output += '-'.repeat(50) + '\n';

        // Show first 5 games with raw data to understand API structure
        output += '\nRAW API DATA (first 5 scheduled games):\n';
        const rawScheduledGames = week17_2025Games.filter((g: any) => g.status !== 'Final');
        rawScheduledGames.slice(0, 5).forEach((game: any, i: number) => {
            output += `Game ${i + 1}:\n`;
            output += `  date: ${game.date}\n`;
            output += `  time: ${JSON.stringify(game.time)}\n`;
            output += `  status: ${JSON.stringify(game.status)}\n`;
            output += `  home_team: ${game.home_team?.abbreviation}\n`;
            output += `  visitor_team: ${game.visitor_team?.abbreviation}\n\n`;
        });

        if (week17_2025Games.length === 0) {
            output += '(No games found for 2025 season)\n';
        } else {
            week17_2025Games.forEach((game: any) => {
                const homeTeam = game.home_team?.abbreviation || 'TBD';
                const awayTeam = game.visitor_team?.abbreviation || 'TBD';
                const date = game.date;
                const time = game.time || 'TBD';
                const status = game.status;
                output += `${date} ${time}: ${awayTeam} @ ${homeTeam} (${status})\n`;
            });
        }

        // Test 2: Get games for 2024 season (which covers Dec 2024 - Feb 2025)
        console.log('\n--- Fetching Week 17 games (2024 Season) ---');
        const week17Response = await axios.get(`${API_BASE}/games`, {
            headers: { 'Authorization': API_KEY },
            params: {
                'seasons[]': 2024,
                'weeks[]': 17,
                'per_page': 50
            }
        });

        const week17Games = week17Response.data.data || [];
        console.log(`2024 Season Week 17: Found ${week17Games.length} games`);

        output += `\n2024 Season Week 17 Games: ${week17Games.length}\n`;
        output += '-'.repeat(50) + '\n';

        week17Games.forEach((game: any) => {
            const homeTeam = game.home_team?.abbreviation || 'TBD';
            const awayTeam = game.visitor_team?.abbreviation || 'TBD';
            const date = game.date;
            const time = game.time || 'TBD';
            const status = game.status;
            const score = status === 'Final' ? `${game.visitor_team_score}-${game.home_team_score}` : '';

            output += `${date} ${time}: ${awayTeam} @ ${homeTeam} (${status}) ${score}\n`;
        });

        // Test 3: Get games for Dec 26-29, 2025
        console.log('\n--- Fetching games by date (Dec 26-29, 2025) ---');
        const dateRange2025Response = await axios.get(`${API_BASE}/games`, {
            headers: { 'Authorization': API_KEY },
            params: {
                'dates[]': ['2025-12-26', '2025-12-27', '2025-12-28', '2025-12-29'],
                'per_page': 50
            }
        });

        const dateRange2025Games = dateRange2025Response.data.data || [];
        console.log(`Dec 26-29 2025: Found ${dateRange2025Games.length} games`);

        output += `\nGames by Date (Dec 26-29, 2025): ${dateRange2025Games.length}\n`;
        output += '-'.repeat(50) + '\n';

        if (dateRange2025Games.length === 0) {
            output += '(No games found for this date range)\n';
        } else {
            dateRange2025Games.forEach((game: any) => {
                const homeTeam = game.home_team?.abbreviation || 'TBD';
                const awayTeam = game.visitor_team?.abbreviation || 'TBD';
                output += `${game.date} ${game.time || 'TBD'}: ${awayTeam} @ ${homeTeam} (${game.status})\n`;
            });
        }

        // Test 4: Get games for Dec 26-29 specifically (2024)
        console.log('\n--- Fetching games by date (Dec 26-29, 2024) ---');
        const dateRangeResponse = await axios.get(`${API_BASE}/games`, {
            headers: { 'Authorization': API_KEY },
            params: {
                'dates[]': ['2024-12-26', '2024-12-27', '2024-12-28', '2024-12-29'],
                'per_page': 50
            }
        });

        const dateRangeGames = dateRangeResponse.data.data || [];
        console.log(`Dec 26-29: Found ${dateRangeGames.length} games`);

        output += `\nGames by Date (Dec 26-29): ${dateRangeGames.length}\n`;
        output += '-'.repeat(50) + '\n';

        dateRangeGames.forEach((game: any) => {
            const homeTeam = game.home_team?.abbreviation || 'TBD';
            const awayTeam = game.visitor_team?.abbreviation || 'TBD';
            const date = game.date;
            const time = game.time || 'TBD';
            const status = game.status;

            output += `${date} ${time}: ${awayTeam} @ ${homeTeam} (${status})\n`;
        });

        // Test 3: Check what the API returns for today
        console.log('\n--- Fetching games for today (Dec 26, 2024) ---');
        const todayResponse = await axios.get(`${API_BASE}/games`, {
            headers: { 'Authorization': API_KEY },
            params: {
                'dates[]': '2024-12-26',
                'per_page': 50
            }
        });

        const todayGames = todayResponse.data.data || [];
        console.log(`Today (Dec 26): Found ${todayGames.length} games`);

        output += `\nGames for Dec 26, 2024: ${todayGames.length}\n`;
        output += '-'.repeat(50) + '\n';

        if (todayGames.length === 0) {
            output += '(No games scheduled for today)\n';
        } else {
            todayGames.forEach((game: any) => {
                output += `${game.date} ${game.time}: ${game.visitor_team?.abbreviation} @ ${game.home_team?.abbreviation} (${game.status})\n`;
            });
        }

        // Test 4: Get scheduled games
        console.log('\n--- Fetching scheduled games ---');
        const scheduledResponse = await axios.get(`${API_BASE}/games`, {
            headers: { 'Authorization': API_KEY },
            params: {
                'seasons[]': 2024,
                'status': 'Scheduled',
                'per_page': 50
            }
        });

        const scheduledGames = scheduledResponse.data.data || [];
        console.log(`Scheduled: Found ${scheduledGames.length} games`);

        output += `\nScheduled Games (2024 Season): ${scheduledGames.length}\n`;
        output += '-'.repeat(50) + '\n';

        // Group by date
        const gamesByDate: Record<string, any[]> = {};
        scheduledGames.forEach((game: any) => {
            const date = game.date.split('T')[0];
            if (!gamesByDate[date]) gamesByDate[date] = [];
            gamesByDate[date].push(game);
        });

        Object.keys(gamesByDate).sort().forEach(date => {
            output += `${date}: ${gamesByDate[date].length} games\n`;
            gamesByDate[date].forEach((game: any) => {
                output += `  ${game.time || 'TBD'}: ${game.visitor_team?.abbreviation} @ ${game.home_team?.abbreviation}\n`;
            });
        });

        fs.writeFileSync('nfl_api_results.txt', output, 'utf8');
        console.log('\nResults written to nfl_api_results.txt');

    } catch (error: any) {
        console.error('API Error:', error.response?.status, error.response?.data || error.message);
        output += `\nAPI Error: ${error.response?.status || error.message}\n`;
        output += `Details: ${JSON.stringify(error.response?.data || {})}\n`;
        fs.writeFileSync('nfl_api_results.txt', output, 'utf8');
    }
}

testNFLAPI();
