/**
 * NFL Roster Sync Job
 * 
 * Fetches active NFL players from Ball Don't Lie API and syncs to database.
 * Also fetches injury data to set vesting eligibility.
 * 
 * Run: Daily during NFL season (September - February)
 * Schedule: 5:00 AM ET
 */

import { storage } from "../storage";
import {
    fetchActivePlayers,
    fetchInjuries,
    createNFLPlayerId,
    normalizePosition,
    getCurrentNFLSeason,
    isNFLApiConfigured,
    type NFLPlayer,
    type NFLInjury,
} from "../balldontlie-nfl";

interface SyncResult {
    success: boolean;
    playersProcessed: number;
    playersAdded: number;
    playersUpdated: number;
    playersDeactivated: number;
    injuredPlayers: number;
    errors: string[];
}

/**
 * Sync NFL roster from Ball Don't Lie API
 */
export async function syncNFLRoster(): Promise<SyncResult> {
    const result: SyncResult = {
        success: false,
        playersProcessed: 0,
        playersAdded: 0,
        playersUpdated: 0,
        playersDeactivated: 0,
        injuredPlayers: 0,
        errors: [],
    };

    if (!isNFLApiConfigured()) {
        result.errors.push("BALLDONTLIE_API_KEY not configured");
        console.error("[NFL Roster Sync] API key not configured");
        return result;
    }

    console.log("[NFL Roster Sync] Starting roster synchronization...");
    const startTime = Date.now();

    try {
        // Fetch all active players
        console.log("[NFL Roster Sync] Fetching active players from API...");
        const apiPlayers = await fetchActivePlayers();
        console.log(`[NFL Roster Sync] Fetched ${apiPlayers.length} players from API`);

        // Fetch current injuries
        console.log("[NFL Roster Sync] Fetching injury report...");
        const injuries = await fetchInjuries();
        console.log(`[NFL Roster Sync] Fetched ${injuries.length} injury records`);

        // Build injury lookup map (player ID -> injury status)
        const injuryMap = new Map<number, NFLInjury>();
        for (const injury of injuries) {
            injuryMap.set(injury.player.id, injury);
        }
        result.injuredPlayers = injuryMap.size;

        // Get existing NFL players from database
        const existingPlayers = await storage.getPlayersBySport("NFL");
        const existingPlayerIds = new Set(existingPlayers.map((p: { id: string }) => p.id));
        const activeApiPlayerIds = new Set<string>();

        // Process each player from API
        for (const apiPlayer of apiPlayers) {
            result.playersProcessed++;

            // Skip players without a team
            if (!apiPlayer.team) {
                continue;
            }

            // Only sync fantasy-relevant positions
            const normalizedPosition = normalizePosition(apiPlayer.position_abbreviation || apiPlayer.position);
            const fantasyPositions = ["QB", "RB", "WR", "TE", "K", "DEF"];
            if (!fantasyPositions.includes(normalizedPosition)) {
                continue;
            }

            const playerId = createNFLPlayerId(apiPlayer.id);
            activeApiPlayerIds.add(playerId);

            // Check injury status for vesting eligibility
            const injury = injuryMap.get(apiPlayer.id);
            const isEligibleForVesting = !injury || (injury.status !== "Out" && injury.status !== "IR");

            const playerData = {
                id: playerId,
                sport: "NFL" as const,
                firstName: apiPlayer.first_name,
                lastName: apiPlayer.last_name,
                team: apiPlayer.team.abbreviation,
                position: normalizedPosition,
                jerseyNumber: apiPlayer.jersey_number || null,
                isActive: true,
                isEligibleForVesting: isEligibleForVesting,
            };

            try {
                if (existingPlayerIds.has(playerId)) {
                    // Update existing player
                    await storage.updatePlayer(playerId, playerData);
                    result.playersUpdated++;
                } else {
                    // Add new player
                    await storage.upsertPlayer(playerData);
                    result.playersAdded++;
                }
            } catch (error: any) {
                result.errors.push(`Failed to sync player ${playerId}: ${error.message}`);
            }
        }

        // Deactivate players no longer in active roster
        for (const existingPlayer of existingPlayers) {
            if (!activeApiPlayerIds.has(existingPlayer.id) && existingPlayer.isActive) {
                try {
                    await storage.updatePlayer(existingPlayer.id, {
                        isActive: false,
                        isEligibleForVesting: false,
                    });
                    result.playersDeactivated++;
                } catch (error: any) {
                    result.errors.push(`Failed to deactivate player ${existingPlayer.id}: ${error.message}`);
                }
            }
        }

        result.success = result.errors.length === 0;
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`[NFL Roster Sync] Completed in ${duration}s`);
        console.log(`  - Players processed: ${result.playersProcessed}`);
        console.log(`  - Players added: ${result.playersAdded}`);
        console.log(`  - Players updated: ${result.playersUpdated}`);
        console.log(`  - Players deactivated: ${result.playersDeactivated}`);
        console.log(`  - Injured players: ${result.injuredPlayers}`);
        if (result.errors.length > 0) {
            console.log(`  - Errors: ${result.errors.length}`);
        }

    } catch (error: any) {
        result.errors.push(`Fatal error: ${error.message}`);
        console.error("[NFL Roster Sync] Fatal error:", error);
    }

    return result;
}



export default syncNFLRoster;
