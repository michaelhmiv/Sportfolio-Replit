import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, Trophy, DollarSign, Award, Percent } from "lucide-react";

interface ContestEntryDrawerProps {
  contestId: string;
  entryId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EntryDetail {
  entry: {
    id: string;
    contestId: string;
    userId: string;
    username: string;
    totalSharesEntered: number;
    totalScore: string;
    rank: number | null;
    payout: string;
    netWinnings: string;
  };
  lineup: Array<{
    id: string;
    playerId: string;
    playerFirstName: string;
    playerLastName: string;
    playerTeam: string;
    playerPosition: string;
    sharesEntered: number;
    fantasyPoints: string;
    earnedScore: string;
    totalPlayerSharesInContest: number;
    ownershipPercentage: string;
  }>;
  contest: {
    id: string;
    name: string;
    status: string;
    totalPrizePool: string;
  };
}

export function ContestEntryDrawer({
  contestId,
  entryId,
  open,
  onOpenChange,
}: ContestEntryDrawerProps) {
  const { data: entryDetails, isLoading } = useQuery<EntryDetail>({
    queryKey: ["/api/contest", contestId, "entries", entryId],
    enabled: !!entryId, // Always fetch when entryId exists, regardless of drawer state
  });

  if (!entryId) {
    return null;
  }

  const netWinnings = entryDetails ? parseFloat(entryDetails.entry.netWinnings) : 0;
  const isWinning = netWinnings > 0;
  const isBreakeven = netWinnings === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto" data-testid="sheet-entry-details">
        <SheetHeader>
          <SheetTitle data-testid="text-entry-username">
            @{entryDetails?.entry.username}'s Entry
          </SheetTitle>
          <SheetDescription>{entryDetails?.contest.name}</SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="py-12 text-center text-muted-foreground">
            Loading entry details...
          </div>
        )}

        {!isLoading && entryDetails && (
          <div className="space-y-4 mt-6">
            {/* Entry Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card data-testid="card-total-score">
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Total Score</div>
                  <div className="font-mono text-xl font-bold">
                    {parseFloat(entryDetails.entry.totalScore).toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-rank">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Trophy className="w-3 h-3" />
                    Rank
                  </div>
                  <div className="text-xl font-bold">
                    {entryDetails.entry.rank ? `#${entryDetails.entry.rank}` : "—"}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-payout">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <DollarSign className="w-3 h-3" />
                    Payout
                  </div>
                  <div className="font-mono text-xl font-bold">
                    ${parseFloat(entryDetails.entry.payout).toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-net-winnings">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <TrendingUp className="w-3 h-3" />
                    Net
                  </div>
                  <div
                    className={`font-mono text-xl font-bold ${
                      isWinning
                        ? "text-positive"
                        : isBreakeven
                        ? "text-muted-foreground"
                        : "text-negative"
                    }`}
                  >
                    {isWinning ? "+" : ""}${netWinnings.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Lineup Details */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Award className="w-4 h-4" />
                Lineup ({entryDetails.lineup.length} Players, {entryDetails.entry.totalSharesEntered} Shares)
              </h3>

              <div className="space-y-2">
                {entryDetails.lineup.map((player) => (
                  <Card key={player.id} className="hover-elevate" data-testid={`card-lineup-player-${player.playerId}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold" data-testid={`text-player-name-${player.playerId}`}>
                              {player.playerFirstName} {player.playerLastName}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {player.playerTeam}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {player.playerPosition}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span data-testid={`text-shares-${player.playerId}`}>
                              {player.sharesEntered} shares
                            </span>
                            <span className="flex items-center gap-1" data-testid={`text-ownership-${player.playerId}`}>
                              <Percent className="w-3 h-3" />
                              {player.ownershipPercentage}% of contest
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-3 sm:gap-8">
                          <div>
                            <div className="text-xs text-muted-foreground">Fantasy Pts</div>
                            <div className="font-mono font-semibold" data-testid={`text-fantasy-points-${player.playerId}`}>
                              {parseFloat(player.fantasyPoints).toFixed(1)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Earned Score</div>
                            <div className="font-mono font-semibold text-primary" data-testid={`text-earned-score-${player.playerId}`}>
                              {parseFloat(player.earnedScore).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Contest Info Footer */}
            <Separator />
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Total Prize Pool:</span>
                <span className="font-mono">${parseFloat(entryDetails.contest.totalPrizePool).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <Badge variant={entryDetails.contest.status === "completed" ? "default" : "secondary"} className="text-xs">
                  {entryDetails.contest.status}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
