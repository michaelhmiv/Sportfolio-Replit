/**
 * PlayerLinkedText Component
 * 
 * Scans text for known player names and automatically hyperlinks them to their player pages.
 * Shows 24h price change next to each linked player name.
 * Uses a cached player name lookup from the API.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { TrendingUp, TrendingDown } from "lucide-react";

interface PlayerLookup {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    priceChange24h: string | null;
}

interface PlayerLinkedTextProps {
    text: string;
    className?: string;
}

/**
 * Hook to fetch player name lookup map
 */
function usePlayerLookup() {
    return useQuery<{ players: PlayerLookup[] }>({
        queryKey: ['/api/players/lookup'],
        staleTime: 1000 * 60 * 15, // Cache for 15 minutes
    });
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format price change with color
 */
function PriceChangeBadge({ change }: { change: string | null }) {
    if (!change) return null;

    const changeNum = parseFloat(change);
    if (isNaN(changeNum) || changeNum === 0) return null;

    const isPositive = changeNum > 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;
    const colorClass = isPositive ? 'text-green-500' : 'text-red-500';

    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${colorClass} ml-1`}>
            <Icon className="w-3 h-3" />
            {isPositive ? '+' : ''}{changeNum.toFixed(1)}%
        </span>
    );
}

/**
 * Component that renders text with player names auto-linked to their player pages
 */
export function PlayerLinkedText({ text, className }: PlayerLinkedTextProps) {
    const { data: lookupData } = usePlayerLookup();

    const linkedContent = useMemo(() => {
        if (!lookupData?.players?.length || !text) {
            return text;
        }

        // Build a map of full names to player IDs (prioritize exact matches)
        const nameToPlayer = new Map<string, PlayerLookup>();

        // Sort players by name length descending (match longer names first)
        const sortedPlayers = [...lookupData.players].sort(
            (a, b) => b.fullName.length - a.fullName.length
        );

        for (const player of sortedPlayers) {
            nameToPlayer.set(player.fullName.toLowerCase(), player);
        }

        // Build a regex pattern from all player names
        const patterns = sortedPlayers.map(p => escapeRegex(p.fullName));
        if (patterns.length === 0) return text;

        const regex = new RegExp(`\\b(${patterns.join('|')})\\b`, 'gi');

        // Split text by matches and create React elements
        const parts: (string | JSX.Element)[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
            // Add text before match
            if (match.index > lastIndex) {
                parts.push(text.slice(lastIndex, match.index));
            }

            // Find the matching player
            const matchedName = match[1].toLowerCase();
            const player = nameToPlayer.get(matchedName);

            if (player) {
                // Add linked player name with price change
                parts.push(
                    <span key={`${player.id}-${match.index}`} className="inline-flex items-center">
                        <Link
                            href={`/player/${player.id}`}
                            className="text-primary font-medium hover:underline cursor-pointer"
                        >
                            {match[1]}
                        </Link>
                        <PriceChangeBadge change={player.priceChange24h} />
                    </span>
                );
            } else {
                // Fallback: just add the text
                parts.push(match[1]);
            }

            lastIndex = regex.lastIndex;
        }

        // Add remaining text after last match
        if (lastIndex < text.length) {
            parts.push(text.slice(lastIndex));
        }

        return parts.length > 0 ? parts : text;
    }, [text, lookupData]);

    // If the content is just a string, render it directly
    if (typeof linkedContent === 'string') {
        return <span className={className}>{linkedContent}</span>;
    }

    // Otherwise render the array of parts
    return <span className={className}>{linkedContent}</span>;
}

