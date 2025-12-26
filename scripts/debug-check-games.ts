import { Pool } from 'pg';
import { format } from 'date-fns';
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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkGamesAndContests() {
    try {
        console.log('DATABASE_URL length:', process.env.DATABASE_URL?.length || 0);
        if (process.env.DATABASE_URL) {
            console.log('DATABASE_URL starts with:', process.env.DATABASE_URL.substring(0, 15));
        }

        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));

        console.log('--- Database Check ---');
        console.log('Date:', format(startOfDay, 'yyyy-MM-dd'));

        const games = await pool.query(
            'SELECT sport, COUNT(*) as count FROM daily_games WHERE date >= $1 AND date <= $2 GROUP BY sport',
            [startOfDay, endOfDay]
        );
        console.log('Games today:', JSON.stringify(games.rows));

        const contests = await pool.query(
            'SELECT sport, COUNT(*) as count FROM contests WHERE game_date >= $1 AND game_date <= $2 GROUP BY sport',
            [startOfDay, endOfDay]
        );
        console.log('Contests today:', JSON.stringify(contests.rows));

        let output = '--- Database Check results ---\n';
        output += `Date: ${format(startOfDay, 'yyyy-MM-dd')}\n\n`;

        const nflGames = await pool.query(
            'SELECT date, COUNT(*) as count FROM daily_games WHERE sport = \'NFL\' GROUP BY date ORDER BY date'
        );
        output += 'NFL Game counts by date:\n';
        nflGames.rows.forEach(r => {
            output += `  ${format(new Date(r.date), 'yyyy-MM-dd')} - Count: ${r.count}\n`;
        });

        const nbaGames = await pool.query(
            'SELECT date, COUNT(*) as count FROM daily_games WHERE sport = \'NBA\' AND date >= $1 GROUP BY date ORDER BY date LIMIT 10',
            [new Date('2025-12-25')]
        );
        output += '\nNBA Games from Dec 25:\n';
        nbaGames.rows.forEach(r => {
            output += `  ${format(new Date(r.date), 'yyyy-MM-dd')} - Count: ${r.count}\n`;
        });

        const contestLogs = await pool.query(
            'SELECT job_name, status, started_at, error_message FROM job_execution_logs WHERE job_name LIKE \'%contest%\' ORDER BY started_at DESC LIMIT 20'
        );
        output += '\nRecent Contest job logs:\n';
        contestLogs.rows.forEach(l => {
            output += `  [${l.job_name}] ${l.status} - ${format(new Date(l.started_at), 'yyyy-MM-dd HH:mm')} - ${l.error_message || ''}\n`;
        });

        // Test what getTodayETBoundaries() would return for Dec 26:
        // Midnight ET on Dec 26 = 05:00 UTC on Dec 26
        // Midnight ET on Dec 27 = 05:00 UTC on Dec 27
        const todayStartUTC = new Date('2025-12-26T05:00:00Z');
        const todayEndUTC = new Date('2025-12-27T05:00:00Z');

        output += `\nTime boundaries for Dec 26 ET:\n`;
        output += `  Start: ${todayStartUTC.toISOString()}\n`;
        output += `  End: ${todayEndUTC.toISOString()}\n`;

        // Query using start_time (like the API does)
        const nflByStartTime = await pool.query(
            'SELECT * FROM daily_games WHERE sport = \'NFL\' AND start_time >= $1 AND start_time < $2',
            [todayStartUTC, todayEndUTC]
        );
        output += '\nNFL Games on Dec 26 (by start_time):\n';
        if (nflByStartTime.rows.length === 0) {
            output += '  (No games found)\n';
        } else {
            nflByStartTime.rows.forEach(g => {
                output += `  ${g.away_team} @ ${g.home_team} - Start: ${format(new Date(g.start_time), 'yyyy-MM-dd HH:mm')} - Status: ${g.status}\n`;
            });
        }

        const nbaByStartTime = await pool.query(
            'SELECT * FROM daily_games WHERE sport = \'NBA\' AND start_time >= $1 AND start_time < $2',
            [todayStartUTC, todayEndUTC]
        );
        output += '\nNBA Games on Dec 26 (by start_time):\n';
        if (nbaByStartTime.rows.length === 0) {
            output += '  (No games found)\n';
        } else {
            nbaByStartTime.rows.forEach((g: any) => {
                const startTimeMs = new Date(g.start_time).getTime();
                const startBoundMs = todayStartUTC.getTime();
                output += `  ${g.away_team} @ ${g.home_team} - Raw: ${g.start_time} - Parsed: ${new Date(g.start_time).toISOString()} - InBounds: ${startTimeMs >= startBoundMs}\n`;
            });
        }

        // Show games where date = Dec 26 to compare date vs start_time
        const allDec26ByDate = await pool.query(
            'SELECT sport, away_team, home_team, date, start_time, status FROM daily_games WHERE date::date = \'2025-12-26\' ORDER BY start_time'
        );
        output += '\nAll games with date = Dec 26 (by date column):\n';
        allDec26ByDate.rows.forEach((g: any) => {
            output += `  [${g.sport}] ${g.away_team} @ ${g.home_team} - Date: ${format(new Date(g.date), 'yyyy-MM-dd')} - Start: ${format(new Date(g.start_time), 'yyyy-MM-dd HH:mm')} UTC\n`;
        });

        // Check database for Dec 27-29 NFL games
        const nflDec27_29 = await pool.query(
            'SELECT game_id, home_team, away_team, date, start_time, status FROM daily_games WHERE sport = \'NFL\' AND date >= \'2025-12-27\' AND date <= \'2025-12-29\' ORDER BY start_time'
        );
        output += '\nNFL Games in Database (Dec 27-29):\n';
        if (nflDec27_29.rows.length === 0) {
            output += '  (No games found)\n';
        } else {
            nflDec27_29.rows.forEach((g: any) => {
                const date = new Date(g.date).toISOString().split('T')[0];
                const startTime = new Date(g.start_time).toISOString();
                output += `  ${g.away_team} @ ${g.home_team} - Date: ${date} - Start: ${startTime} - Status: ${g.status}\n`;
            });
        }

        // Check for games starting tonight (after 5 PM ET = 22:00 UTC)
        const tonightStartUTC = new Date('2025-12-26T22:00:00Z');
        const tonightEndUTC = new Date('2025-12-27T08:00:00Z');

        const tonightNBA = await pool.query(
            'SELECT * FROM daily_games WHERE sport = \'NBA\' AND start_time >= $1 AND start_time < $2 ORDER BY start_time',
            [tonightStartUTC, tonightEndUTC]
        );
        output += '\nNBA Games tonight (after 5 PM ET):\n';
        if (tonightNBA.rows.length === 0) {
            output += '  (No games found)\n';
        } else {
            tonightNBA.rows.forEach((g: any) => {
                output += `  ${g.away_team} @ ${g.home_team} - Start: ${format(new Date(g.start_time), 'yyyy-MM-dd HH:mm')} UTC - Status: ${g.status}\n`;
            });
        }

        fs.writeFileSync('debug_results.txt', output, 'utf8');
        console.log('Results written to debug_results.txt');

        await pool.end();
    } catch (e) {
        console.error('ERROR:', e);
        await pool.end();
        process.exit(1);
    }
}

checkGamesAndContests();
