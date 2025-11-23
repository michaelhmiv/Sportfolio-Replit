/**
 * Time Utilities for Eastern Time (ET) Game Scheduling
 * 
 * All game scheduling is based on game start_time in Eastern Time.
 * These utilities provide a single source of truth for determining
 * which "day" a game belongs to, regardless of timezone offsets.
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay } from 'date-fns';

const ET_TIMEZONE = 'America/New_York';

/**
 * Get the "game day" in Eastern Time as a YYYY-MM-DD string.
 * This is the canonical identifier for which day a game belongs to.
 * 
 * @param startTime - The game's start time (Date or ISO string)
 * @returns YYYY-MM-DD string representing the game day in ET
 * 
 * @example
 * // Game at 9:00 PM ET on Nov 22 (2:00 AM UTC Nov 23)
 * getGameDay(new Date('2025-11-23T02:00:00Z')) // Returns '2025-11-22'
 * 
 * // Game at 1:00 PM ET on Nov 22 (6:00 PM UTC Nov 22)
 * getGameDay(new Date('2025-11-22T18:00:00Z')) // Returns '2025-11-22'
 */
export function getGameDay(startTime: Date | string): string {
  const date = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const etTime = toZonedTime(date, ET_TIMEZONE);
  const year = etTime.getFullYear();
  const month = String(etTime.getMonth() + 1).padStart(2, '0');
  const day = String(etTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the start and end of a day in Eastern Time as UTC Date objects.
 * Used for querying games that belong to a specific day.
 * 
 * @param gameDay - YYYY-MM-DD string in Eastern Time
 * @returns Object with startOfDay and endOfDay as UTC Date objects
 *          Note: endOfDay is the exclusive upper bound (start of next day)
 * 
 * @example
 * const { startOfDay, endOfDay } = getETDayBoundaries('2025-11-22');
 * // startOfDay: 2025-11-22T05:00:00Z (midnight ET on Nov 22)
 * // endOfDay: 2025-11-23T05:00:00Z (midnight ET on Nov 23 - exclusive)
 * // Query: WHERE start_time >= startOfDay AND start_time < endOfDay
 */
export function getETDayBoundaries(gameDay: string): {
  startOfDay: Date;
  endOfDay: Date;
} {
  // Parse the date components
  const [year, month, day] = gameDay.split('-').map(Number);
  
  // Create midnight ET for this day and next day
  const startOfDayETString = `${gameDay}T00:00:00`;
  
  // Calculate next day for exclusive upper bound
  const nextDay = new Date(year, month - 1, day + 1);
  const nextYear = nextDay.getFullYear();
  const nextMonth = String(nextDay.getMonth() + 1).padStart(2, '0');
  const nextDayNum = String(nextDay.getDate()).padStart(2, '0');
  const endOfDayETString = `${nextYear}-${nextMonth}-${nextDayNum}T00:00:00`;
  
  // fromZonedTime treats these strings as ET times and converts to UTC
  const utcStartOfDay = fromZonedTime(startOfDayETString, ET_TIMEZONE);
  const utcEndOfDay = fromZonedTime(endOfDayETString, ET_TIMEZONE);
  
  return {
    startOfDay: utcStartOfDay,
    endOfDay: utcEndOfDay,
  };
}

/**
 * Get today's date in Eastern Time as a YYYY-MM-DD string.
 * Used for "games today" queries.
 * 
 * @returns YYYY-MM-DD string representing today in ET
 */
export function getTodayET(): string {
  const now = new Date();
  return getGameDay(now);
}

/**
 * Get the UTC time boundaries for today in Eastern Time.
 * Convenience method that combines getTodayET() and getETDayBoundaries().
 * 
 * @returns Object with startOfDay and endOfDay as UTC Date objects for today ET
 */
export function getTodayETBoundaries(): {
  startOfDay: Date;
  endOfDay: Date;
} {
  const todayET = getTodayET();
  return getETDayBoundaries(todayET);
}
