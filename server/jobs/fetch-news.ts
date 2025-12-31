/**
 * News Fetch Job (v2 - Context-Aware Multi-Story)
 * 
 * Runs hourly to fetch breaking sports news using Perplexity AI (Sonar Pro).
 * Features:
 * - Feeds last 7 days of headlines as context to avoid duplicates
 * - Supports multiple stories per query (up to 3)
 * - AI-powered deduplication and follow-up detection
 * - Cleans up entries older than 7 days
 */

import { db } from "../db";
import { newsFeed } from "@shared/schema";
import { perplexityService } from "../services/perplexity";
import { createHash } from "crypto";
import { desc, lt, sql } from "drizzle-orm";
import type { ProgressCallback } from "../lib/admin-stream";

interface NewsResult {
    success: boolean;
    storiesProcessed: number;
    stories: Array<{
        headline: string;
        briefing: string;
        sport: string;
        type: 'NEW' | 'UPDATE';
    }>;
    error?: string;
}

interface ParsedStory {
    type: 'NEW' | 'UPDATE';
    headline: string;
    briefing: string;
    sport: 'NBA' | 'NFL';
}

/**
 * Generate a content hash for deduplication (backup check)
 */
function generateContentHash(headline: string): string {
    return createHash('sha256').update(headline.toLowerCase().trim()).digest('hex');
}

/**
 * Get recent headlines from the database to use as context
 */
async function getRecentHeadlines(): Promise<string[]> {
    const recentNews = await db
        .select({ headline: newsFeed.headline, createdAt: newsFeed.createdAt })
        .from(newsFeed)
        .orderBy(desc(newsFeed.createdAt))
        .limit(30); // Last 30 headlines should be plenty of context

    return recentNews.map(n => {
        const daysAgo = Math.floor((Date.now() - new Date(n.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        const timeLabel = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
        return `- "${n.headline}" (${timeLabel})`;
    });
}

/**
 * Build the context-aware prompt with recent news history
 */
function buildPrompt(recentHeadlines: string[]): string {
    const headlinesContext = recentHeadlines.length > 0
        ? `STORIES WE'VE ALREADY REPORTED (do not repeat unless there's a significant update):\n${recentHeadlines.join('\n')}\n\n`
        : 'We have no recent news history yet.\n\n';

    return `You are a breaking news reporter for NBA and NFL sports.

${headlinesContext}INSTRUCTIONS:
1. Search for the most significant NBA and NFL news from TODAY
2. Report up to 3 stories maximum (only truly newsworthy items)
3. For stories we've already covered, only report if there's a MAJOR UPDATE with new information
4. Prioritize: player injuries, trades, major performances, surprising results

OUTPUT FORMAT (use this EXACT structure for each story):
---STORY---
TYPE: NEW
HEADLINE: [Concise headline, max 80 characters]
BRIEFING: [1-2 sentence summary for sports traders, focus on impact]
SPORT: NBA
---END---

For updates to existing stories, use TYPE: UPDATE

IMPORTANT: If there is no significant new news to report, you MUST respond with exactly this text and nothing else:
NO_NEWS`;
}

/**
 * Parse the multi-story response from Perplexity
 */
function parseMultiStoryResponse(content: string): ParsedStory[] {
    const stories: ParsedStory[] = [];

    // Handle NO_NEWS response
    if (content.trim() === 'NO_NEWS' || content.includes('NO_NEWS')) {
        console.log('[News] Perplexity returned NO_NEWS - no significant news at this time');
        return [];
    }

    // Split by story delimiter
    const storyBlocks = content.split('---STORY---').slice(1); // Skip first empty element

    for (const block of storyBlocks) {
        try {
            const endIdx = block.indexOf('---END---');
            const storyContent = endIdx > 0 ? block.substring(0, endIdx) : block;

            // Parse each field
            const typeMatch = storyContent.match(/TYPE:\s*(NEW|UPDATE)/i);
            const headlineMatch = storyContent.match(/HEADLINE:\s*(.+?)(?=\n|BRIEFING:)/is);
            const briefingMatch = storyContent.match(/BRIEFING:\s*(.+?)(?=\n|SPORT:)/is);
            const sportMatch = storyContent.match(/SPORT:\s*(NBA|NFL)/i);

            if (headlineMatch && briefingMatch) {
                // Clean up citation numbers and formatting artifacts
                const cleanText = (text: string): string => {
                    return text
                        .replace(/\[\d+\]/g, '') // Remove citation numbers like [1], [2]
                        .replace(/[\[\]]/g, '')  // Remove stray brackets
                        .replace(/\s+/g, ' ')    // Normalize whitespace
                        .trim();
                };

                stories.push({
                    type: (typeMatch?.[1]?.toUpperCase() as 'NEW' | 'UPDATE') || 'NEW',
                    headline: cleanText(headlineMatch[1]),
                    briefing: cleanText(briefingMatch[1]),
                    sport: (sportMatch?.[1]?.toUpperCase() as 'NBA' | 'NFL') || 'NBA',
                });
            }
        } catch (e) {
            console.warn('[News] Failed to parse story block:', block.substring(0, 100));
        }
    }

    return stories;
}

/**
 * Fetch news from Perplexity and store in database
 */
export async function fetchNews(progressCallback?: ProgressCallback): Promise<NewsResult> {
    try {
        progressCallback?.({ message: 'Checking Perplexity service status...', type: 'info' });

        if (!perplexityService.isReady()) {
            const error = 'Perplexity service not configured. Skipping news fetch.';
            console.log(`[News] ${error}`);
            progressCallback?.({ message: error, type: 'warning' });
            return { success: false, storiesProcessed: 0, stories: [], error };
        }

        // Get recent headlines for context
        progressCallback?.({ message: 'Loading recent news for context...', type: 'info' });
        const recentHeadlines = await getRecentHeadlines();
        console.log(`[News] Loaded ${recentHeadlines.length} recent headlines for context`);

        // Build context-aware prompt
        const prompt = buildPrompt(recentHeadlines);

        progressCallback?.({ message: 'Fetching breaking news from Perplexity...', type: 'info' });
        console.log('[News] Fetching breaking news with context...');

        // Call Perplexity
        const response = await perplexityService.fetchBreakingNews(prompt);

        if (!response.success || !response.content) {
            const error = response.error || 'No content received';
            console.error('[News] Perplexity failed:', error);
            progressCallback?.({ message: `Failed to fetch news: ${error}`, type: 'error' });
            return { success: false, storiesProcessed: 0, stories: [], error };
        }

        console.log('[News] Raw response:', response.content.substring(0, 500));

        // Parse multi-story response
        const parsedStories = parseMultiStoryResponse(response.content);

        if (parsedStories.length === 0) {
            console.log('[News] No significant news to report');
            progressCallback?.({ message: 'No significant news at this time', type: 'info' });
            return { success: true, storiesProcessed: 0, stories: [] };
        }

        console.log(`[News] Parsed ${parsedStories.length} stories from response`);

        // Process each story
        const processedStories: NewsResult['stories'] = [];

        for (const story of parsedStories) {
            // Generate hash for backup deduplication check
            const contentHash = generateContentHash(story.headline);

            // Check if this exact headline already exists (backup check)
            const existing = await db
                .select()
                .from(newsFeed)
                .where(sql`${newsFeed.contentHash} = ${contentHash}`)
                .limit(1);

            if (existing.length > 0) {
                console.log(`[News] Skipping duplicate: "${story.headline.substring(0, 50)}..."`);
                continue;
            }

            // Insert new story
            await db.insert(newsFeed).values({
                headline: story.headline,
                briefing: story.briefing,
                sourceUrl: response.citations?.[0] || null,
                contentHash,
                sport: story.sport,
            });

            console.log(`[News] Stored ${story.type} ${story.sport} news: "${story.headline}"`);
            progressCallback?.({ message: `Stored: "${story.headline.substring(0, 40)}..."`, type: 'success' });

            processedStories.push({
                headline: story.headline,
                briefing: story.briefing,
                sport: story.sport,
                type: story.type,
            });
        }

        // Cleanup old entries (older than 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const deleted = await db
            .delete(newsFeed)
            .where(lt(newsFeed.createdAt, sevenDaysAgo));

        if (deleted.rowCount && deleted.rowCount > 0) {
            console.log(`[News] Cleaned up ${deleted.rowCount} old news entries`);
        }

        return {
            success: true,
            storiesProcessed: processedStories.length,
            stories: processedStories,
        };
    } catch (error: any) {
        console.error('[News] Fetch failed:', error.message);
        progressCallback?.({ message: `Error: ${error.message}`, type: 'error' });
        return { success: false, storiesProcessed: 0, stories: [], error: error.message };
    }
}
