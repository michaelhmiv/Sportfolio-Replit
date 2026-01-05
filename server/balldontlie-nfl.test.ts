/**
 * Tests for Ball Don't Lie NFL API utilities
 * 
 * These tests verify core functions used for NFL data processing
 * including fantasy points calculation and player ID generation.
 */

import { describe, it, expect } from 'vitest';
import {
    calculateNFLFantasyPoints,
    createNFLPlayerId,
    normalizePosition,
    getCurrentNFLSeason,
    parseStatsToJson,
    type NFLGameStats,
} from '../server/balldontlie-nfl';

describe('calculateNFLFantasyPoints', () => {
    // Helper to create mock stats
    const createMockStats = (overrides: Partial<NFLGameStats> = {}): NFLGameStats => ({
        id: 1,
        player: { id: 1, first_name: 'Test', last_name: 'Player', position: 'QB', position_abbreviation: 'QB', height: '6-2', weight: '220', jersey_number: '1', college: 'Test U', experience: '1', age: 25 },
        game: { id: 1, date: '2024-01-01', week: 1, season: 2024, status: 'Final', home_team: { id: 1, name: 'Team', full_name: 'Team', abbreviation: 'TM', city: 'City', conference: 'NFC', division: 'North' }, visitor_team: { id: 2, name: 'Team2', full_name: 'Team2', abbreviation: 'TM2', city: 'City2', conference: 'AFC', division: 'South' }, home_team_score: 21, visitor_team_score: 14 },
        team: { id: 1, name: 'Team', full_name: 'Team', abbreviation: 'TM', city: 'City', conference: 'NFC', division: 'North' },
        passing_completions: 0,
        passing_attempts: 0,
        passing_yards: 0,
        passing_touchdowns: 0,
        passing_interceptions: 0,
        passing_rating: 0,
        sacks_taken: 0,
        rushing_attempts: 0,
        rushing_yards: 0,
        rushing_touchdowns: 0,
        rushing_fumbles: 0,
        rushing_fumbles_lost: 0,
        rushing_long: 0,
        receiving_receptions: 0,
        receiving_targets: 0,
        receiving_yards: 0,
        receiving_touchdowns: 0,
        receiving_fumbles: 0,
        receiving_fumbles_lost: 0,
        receiving_long: 0,
        two_point_conversions: 0,
        ...overrides,
    });

    it('should return 0 for empty stats', () => {
        const stats = createMockStats();
        expect(calculateNFLFantasyPoints(stats)).toBe(0);
    });

    it('should calculate passing points correctly (1 pt per 25 yards)', () => {
        const stats = createMockStats({ passing_yards: 250 });
        // 250 yards * 0.04 = 10 points
        expect(calculateNFLFantasyPoints(stats)).toBe(10);
    });

    it('should add 4 points per passing TD', () => {
        const stats = createMockStats({ passing_touchdowns: 3 });
        // 3 TDs * 4 = 12 points
        expect(calculateNFLFantasyPoints(stats)).toBe(12);
    });

    it('should subtract 2 points per interception', () => {
        const stats = createMockStats({ passing_interceptions: 2 });
        // 2 INTs * -2 = -4 points
        expect(calculateNFLFantasyPoints(stats)).toBe(-4);
    });

    it('should add 300+ passing yard bonus', () => {
        const stats = createMockStats({ passing_yards: 300 });
        // 300 yards * 0.04 = 12 + 2 bonus = 14 points
        expect(calculateNFLFantasyPoints(stats)).toBe(14);
    });

    it('should calculate rushing points correctly (1 pt per 10 yards)', () => {
        const stats = createMockStats({ rushing_yards: 100 });
        // 100 yards * 0.1 = 10 + 2 bonus = 12 points
        expect(calculateNFLFantasyPoints(stats)).toBe(12);
    });

    it('should add 6 points per rushing TD', () => {
        const stats = createMockStats({ rushing_touchdowns: 2 });
        // 2 TDs * 6 = 12 points
        expect(calculateNFLFantasyPoints(stats)).toBe(12);
    });

    it('should subtract 2 points per fumble lost (rushing)', () => {
        const stats = createMockStats({ rushing_fumbles_lost: 1 });
        // 1 fumble * -2 = -2 points
        expect(calculateNFLFantasyPoints(stats)).toBe(-2);
    });

    it('should calculate receiving points correctly (Standard - no PPR)', () => {
        const stats = createMockStats({
            receiving_yards: 80,
            receiving_receptions: 5 // Receptions should NOT add points in Standard scoring
        });
        // 80 yards * 0.1 = 8 points (no reception bonus)
        expect(calculateNFLFantasyPoints(stats)).toBe(8);
    });

    it('should add 100+ receiving yard bonus', () => {
        const stats = createMockStats({ receiving_yards: 150 });
        // 150 yards * 0.1 = 15 + 2 bonus = 17 points
        expect(calculateNFLFantasyPoints(stats)).toBe(17);
    });

    it('should add 2 points per 2-point conversion', () => {
        const stats = createMockStats({ two_point_conversions: 1 });
        expect(calculateNFLFantasyPoints(stats)).toBe(2);
    });

    it('should calculate a realistic QB game correctly', () => {
        const stats = createMockStats({
            passing_yards: 302,
            passing_touchdowns: 3,
            passing_interceptions: 1,
            rushing_yards: 25,
        });
        // Passing: 302 * 0.04 = 12.08 + 2 (300+ bonus) = 14.08
        // Pass TDs: 3 * 4 = 12
        // INT: 1 * -2 = -2
        // Rushing: 25 * 0.1 = 2.5
        // Total: 14.08 + 12 - 2 + 2.5 = 26.58
        expect(calculateNFLFantasyPoints(stats)).toBe(26.58);
    });

    it('should calculate a realistic RB game correctly', () => {
        const stats = createMockStats({
            rushing_yards: 112,
            rushing_touchdowns: 1,
            receiving_yards: 35,
            receiving_touchdowns: 0,
        });
        // Rushing: 112 * 0.1 = 11.2 + 2 (100+ bonus) = 13.2
        // Rush TDs: 1 * 6 = 6
        // Receiving: 35 * 0.1 = 3.5
        // Total: 13.2 + 6 + 3.5 = 22.7
        expect(calculateNFLFantasyPoints(stats)).toBe(22.7);
    });
});

describe('createNFLPlayerId', () => {
    it('should prefix player ID with nfl_', () => {
        expect(createNFLPlayerId(12345)).toBe('nfl_12345');
    });

    it('should handle single digit IDs', () => {
        expect(createNFLPlayerId(1)).toBe('nfl_1');
    });

    it('should handle large IDs', () => {
        expect(createNFLPlayerId(999999999)).toBe('nfl_999999999');
    });
});

describe('normalizePosition', () => {
    it('should normalize QB correctly', () => {
        expect(normalizePosition('QB')).toBe('QB');
    });

    it('should normalize RB correctly', () => {
        expect(normalizePosition('RB')).toBe('RB');
    });

    it('should normalize FB to RB', () => {
        expect(normalizePosition('FB')).toBe('RB');
    });

    it('should normalize WR correctly', () => {
        expect(normalizePosition('WR')).toBe('WR');
    });

    it('should normalize TE correctly', () => {
        expect(normalizePosition('TE')).toBe('TE');
    });

    it('should normalize K correctly', () => {
        expect(normalizePosition('K')).toBe('K');
    });

    it('should normalize P to K', () => {
        expect(normalizePosition('P')).toBe('K');
    });

    it('should normalize defensive positions to DEF', () => {
        const defPositions = ['DE', 'DT', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'S', 'FS', 'SS', 'DB', 'DL'];
        defPositions.forEach(pos => {
            expect(normalizePosition(pos)).toBe('DEF');
        });
    });

    it('should return unknown positions as-is', () => {
        expect(normalizePosition('OL')).toBe('OL');
        expect(normalizePosition('C')).toBe('C');
    });
});

describe('getCurrentNFLSeason', () => {
    it('should return a reasonable season year', () => {
        const season = getCurrentNFLSeason();
        const currentYear = new Date().getFullYear();
        // Season should be current year or previous year
        expect(season).toBeGreaterThanOrEqual(currentYear - 1);
        expect(season).toBeLessThanOrEqual(currentYear);
    });
});

describe('parseStatsToJson', () => {
    it('should convert stats to JSON format', () => {
        const stats = {
            id: 1,
            player: {} as any,
            game: {} as any,
            team: {} as any,
            passing_completions: 20,
            passing_attempts: 30,
            passing_yards: 250,
            passing_touchdowns: 2,
            passing_interceptions: 1,
            passing_rating: 98.5,
            sacks_taken: 2,
            rushing_attempts: 5,
            rushing_yards: 25,
            rushing_touchdowns: 0,
            rushing_fumbles: 0,
            rushing_fumbles_lost: 0,
            rushing_long: 12,
            receiving_receptions: 0,
            receiving_targets: 0,
            receiving_yards: 0,
            receiving_touchdowns: 0,
            receiving_fumbles: 0,
            receiving_fumbles_lost: 0,
            receiving_long: 0,
            two_point_conversions: 0,
        };

        const json = parseStatsToJson(stats);

        expect(json.passing_yards).toBe(250);
        expect(json.passing_touchdowns).toBe(2);
        expect(json.rushing_yards).toBe(25);
        expect(json.two_point_conversions).toBe(0);
    });
});
