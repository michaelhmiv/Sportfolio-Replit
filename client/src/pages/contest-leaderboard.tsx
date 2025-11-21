import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useEffect, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { useWebSocket } from "@/lib/websocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, User } from "lucide-react";
import { ContestEntryDrawer } from "@/components/contest-entry-drawer";
import { Button } from "@/components/ui/button";

interface PlayerLineupStats {
  entryId: string;
  playerId: string;
  playerName: string;
  sharesEntered: number;
  fantasyPoints: number;
  earnedScore: number;
}

interface LeaderboardEntry {
  entryId: string;
  userId: string;
  username: string;
  totalScore: number;
  rank: number;
  payout: string;
  players: PlayerLineupStats[];
}

interface LeaderboardData {
  contest: {
    id: string;
    name: string;
    sport: string;
    status: string;
    totalPrizePool: string;
    entryFee: string;
  };
  leaderboard: LeaderboardEntry[];
  myEntry?: LeaderboardEntry;
}

export default function ContestLeaderboard() {
  const { id } = useParams<{ id: string }>();
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { subscribe } = useWebSocket();

  const { data, isLoading } = useQuery<LeaderboardData>({
    queryKey: ["/api/contest", id, "leaderboard"],
  });

  const handleViewEntry = (entryId: string) => {
    setSelectedEntryId(entryId);
    setDrawerOpen(true);
  };

  // WebSocket connection for real-time contest updates
  useEffect(() => {
    if (!id) return;

    // Subscribe to contest update events
    const unsubContestUpdate = subscribe('contestUpdate', (data) => {
      if (data.contestId === id) {
        queryClient.invalidateQueries({ queryKey: ["/api/contest", id, "leaderboard"] });
      }
    });

    // Subscribe to live stats events (affects contest rankings)
    const unsubLiveStats = subscribe('liveStats', () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contest", id, "leaderboard"] });
    });

    return () => {
      unsubContestUpdate();
      unsubLiveStats();
    };
  }, [id, subscribe]);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading leaderboard...</div>
      </div>
    );
  }

  const winningThreshold = Math.ceil(data.leaderboard.length / 2);
  const totalSharesEntered = data.myEntry?.players.reduce((sum, p) => sum + p.sharesEntered, 0) || 0;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold">{data.contest.name}</h1>
            <Badge className="capitalize">{data.contest.status}</Badge>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span>Total Prize Pool: <span className="font-mono font-bold text-positive">${data.contest.totalPrizePool}</span></span>
            <span>Top {winningThreshold} win</span>
            <span>{data.leaderboard.length} entries</span>
          </div>
        </div>

        {/* My Entry */}
        {data.myEntry && (
          <Card className="mb-6 border-primary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium uppercase tracking-wide">Your Entry</CardTitle>
                <Badge variant="outline">Rank #{data.myEntry.rank || "-"}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Score</div>
                  <div className="text-2xl font-mono font-bold">{data.myEntry.totalScore.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Shares Entered</div>
                  <div className="text-2xl font-bold">{totalSharesEntered}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Status</div>
                  <Badge className={data.myEntry.rank && data.myEntry.rank <= winningThreshold ? 'bg-positive' : 'bg-muted'}>
                    {data.myEntry.rank && data.myEntry.rank <= winningThreshold ? 'WINNING' : 'Not winning'}
                  </Badge>
                </div>
              </div>

              {/* Lineup Details */}
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide mb-2">Your Lineup</div>
                {data.myEntry.players.map((player) => (
                  <div key={player.playerId} className="flex items-center justify-between p-2 bg-muted rounded-md text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold">
                          {player.playerName.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <span className="font-medium">{player.playerName}</span>
                      <Badge variant="outline" className="text-xs">{player.sharesEntered} shares</Badge>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-medium">{player.earnedScore.toFixed(2)} pts</div>
                      <div className="text-xs text-muted-foreground">{player.fantasyPoints.toFixed(1)} FP</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wide">Leaderboard</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rank</th>
                    <th className="text-left px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">User</th>
                    <th className="text-right px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Score</th>
                    <th className="text-right px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Shares</th>
                    <th className="text-right px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Winnings</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.map((entry, idx) => {
                    const isWinning = entry.rank <= winningThreshold;
                    const isMyEntry = data.myEntry?.entryId === entry.entryId;
                    const entryShares = entry.players.reduce((sum, p) => sum + p.sharesEntered, 0);
                    const payout = parseFloat(entry.payout);
                    const winnings = payout > 0 ? `$${payout.toFixed(2)}` : (data.contest.status === "completed" ? "$0.00" : "TBD");
                    
                    return (
                      <tr
                        key={entry.entryId}
                        className={`border-b hover-elevate ${isMyEntry ? 'bg-primary/5' : ''}`}
                        data-testid={`row-leaderboard-${idx}`}
                      >
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <span className="font-mono font-bold text-sm">
                              #{entry.rank}
                            </span>
                            {entry.rank <= 3 && (
                              <Trophy className={`w-3 h-3 ${entry.rank === 1 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleViewEntry(entry.entryId)}
                              className="text-sm font-medium hover:text-primary hover:underline cursor-pointer text-left truncate max-w-[120px]"
                              data-testid={`button-view-entry-${entry.userId}`}
                            >
                              @{entry.username}
                            </button>
                            <Link href={`/user/${entry.userId}`}>
                              <Button variant="ghost" size="icon" className="h-5 w-5" data-testid={`link-profile-${entry.userId}`}>
                                <User className="w-3 h-3" />
                              </Button>
                            </Link>
                            {isMyEntry && <Badge variant="outline" className="text-[10px] px-1">You</Badge>}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleViewEntry(entry.entryId)}
                              className="text-sm font-mono font-bold hover:text-primary hover:underline cursor-pointer"
                              data-testid={`button-view-score-${entry.userId}`}
                            >
                              {entry.totalScore.toFixed(2)}
                            </button>
                            {isWinning && <TrendingUp className="w-3 h-3 text-positive" />}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-sm">{entryShares}</td>
                        <td className="px-2 py-2 text-right">
                          <span className={`text-sm font-mono font-semibold ${payout > 0 ? 'text-positive' : 'text-muted-foreground'}`} data-testid={`text-winnings-${entry.userId}`}>
                            {winnings}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <ContestEntryDrawer
        contestId={id || ""}
        entryId={selectedEntryId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
