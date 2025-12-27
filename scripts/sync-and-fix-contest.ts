/**
 * Sync NFL Games and Update Contest
 * 
 * 1. Re-syncs NFL schedule to get correct game times from API
 * 2. Updates the contest to match the earliest game time
 */

import { syncNFLSchedule } from '../server/jobs/sync-nfl-schedule';
import { storage } from '../server/storage';
import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';

async function fixNFLContestTimes() {
    console.log('=== Syncing NFL Schedule and Fixing Contest Times ===\n');

    // Step 1: Run the NFL schedule sync
    console.log('Step 1: Syncing NFL schedule from API...\n');
    const syncResult = await syncNFLSchedule();
    console.log(`Sync result: ${syncResult.gamesProcessed} processed, ${syncResult.gamesUpdated} updated\n`);

    // Step 2: Get today's NFL games
    const now = new Date();
    const etNow = toZonedTime(now, 'America/New_York');
    const todayStr = format(etNow, 'yyyy-MM-dd', { timeZone: 'America/New_York' });
    console.log(`Today in ET: ${todayStr}`);

    // Get start and end of today in ET
    const startOfDayET = fromZonedTime(`${todayStr}T00:00:00`, 'America/New_York');
    const endOfDayET = fromZonedTime(`${todayStr}T23:59:59.999`, 'America/New_York');

    console.log(`Looking for games between ${startOfDayET.toISOString()} and ${endOfDayET.toISOString()}\n`);

    const games = await storage.getDailyGamesBySport('NFL', startOfDayET, endOfDayET);

    console.log(`Found ${games.length} NFL games for today:\n`);
    for (const g of games) {
        const startTimeET = toZonedTime(g.startTime!, 'America/New_York');
        console.log(`  ${g.awayTeam} @ ${g.homeTeam}: ${format(startTimeET, 'h:mm a', { timeZone: 'America/New_York' })} ET`);
    }

    if (games.length === 0) {
        console.log('\nNo NFL games found for today. Exiting.');
        return;
    }

    // Find earliest game
    const sortedGames = games.sort((a, b) =>
        new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime()
    );
    const earliestGame = sortedGames[0];
    const earliestStartTime = new Date(earliestGame.startTime!);

    console.log(`\nEarliest game: ${earliestGame.awayTeam} @ ${earliestGame.homeTeam}`);
    console.log(`Start time: ${format(toZonedTime(earliestStartTime, 'America/New_York'), 'h:mm a', { timeZone: 'America/New_York' })} ET`);

    // Step 3: Update the contest
    console.log('\nStep 3: Updating NFL contest...\n');

    const allContests = await storage.getContests();
    const todayNFLContest = allContests.find(c => {
        if (c.sport !== 'NFL') return false;
        const contestDateStr = format(toZonedTime(c.gameDate, 'America/New_York'), 'yyyy-MM-dd', { timeZone: 'America/New_York' });
        return contestDateStr === todayStr && (c.status === 'open' || c.status === 'live');
    });

    if (!todayNFLContest) {
        console.log('No open/live NFL contest found for today.');
        return;
    }

    console.log(`Found contest: ${todayNFLContest.name}`);
    console.log(`Current starts_at: ${format(toZonedTime(todayNFLContest.startsAt, 'America/New_York'), 'h:mm a', { timeZone: 'America/New_York' })} ET`);

    // Update to match earliest game
    await storage.updateContest(todayNFLContest.id, {
        startsAt: earliestStartTime,
        status: now < earliestStartTime ? 'open' : todayNFLContest.status
    });

    console.log(`Updated to: ${format(toZonedTime(earliestStartTime, 'America/New_York'), 'h:mm a', { timeZone: 'America/New_York' })} ET`);
    console.log('\nDone!');
}

fixNFLContestTimes().catch(console.error);
