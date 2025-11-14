import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp } from "lucide-react";
import type { ContestEntry, ContestLineup, Player } from "@shared/schema";

interface LeaderboardData {
  contest: {
    id: string;
    name: string;
    sport: string;
    status: string;
    totalPrizePool: string;
  };
  entries: (ContestEntry & {
    user: { username: string };
    lineups: (ContestLineup & { player: Player })[];
  })[];
  myEntry?: ContestEntry & {
    lineups: (ContestLineup & { player: Player })[];
  };
}

export default function ContestLeaderboard() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<LeaderboardData>({
    queryKey: ["/api/contest", id, "leaderboard"],
    refetchInterval: 10000, // Refresh every 10 seconds for live updates
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading leaderboard...</div>
      </div>
    );
  }

  const winningThreshold = Math.ceil(data.entries.length / 2);

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
            <span>{data.entries.length} entries</span>
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Score</div>
                  <div className="text-2xl font-mono font-bold">{data.myEntry.totalScore}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Shares Entered</div>
                  <div className="text-2xl font-bold">{data.myEntry.totalSharesEntered}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Potential Payout</div>
                  <div className={`text-2xl font-mono font-bold ${data.myEntry.rank && data.myEntry.rank <= winningThreshold ? 'text-positive' : ''}`}>
                    ${data.myEntry.payout}
                  </div>
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
                {data.myEntry.lineups.map((lineup) => (
                  <div key={lineup.id} className="flex items-center justify-between p-2 bg-muted rounded-md text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold">
                          {lineup.player.firstName[0]}{lineup.player.lastName[0]}
                        </span>
                      </div>
                      <span className="font-medium">{lineup.player.firstName} {lineup.player.lastName}</span>
                      <Badge variant="outline" className="text-xs">{lineup.sharesEntered} shares</Badge>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-medium">{lineup.earnedScore} pts</div>
                      <div className="text-xs text-muted-foreground">{lineup.fantasyPoints} FP</div>
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
                    <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rank</th>
                    <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">User</th>
                    <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score</th>
                    <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shares</th>
                    <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry, idx) => {
                    const isWinning = (entry.rank || idx + 1) <= winningThreshold;
                    const isMyEntry = data.myEntry?.id === entry.id;
                    
                    return (
                      <tr
                        key={entry.id}
                        className={`border-b hover-elevate ${isMyEntry ? 'bg-primary/5' : ''}`}
                        data-testid={`row-leaderboard-${idx}`}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-lg">
                              #{entry.rank || idx + 1}
                            </span>
                            {(entry.rank || idx + 1) <= 3 && (
                              <Trophy className={`w-4 h-4 ${(entry.rank || idx + 1) === 1 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-medium">{entry.user.username}</div>
                          {isMyEntry && <Badge variant="outline" className="text-xs mt-1">You</Badge>}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xl font-mono font-bold">{entry.totalScore}</span>
                            {isWinning && <TrendingUp className="w-4 h-4 text-positive" />}
                          </div>
                        </td>
                        <td className="p-4 text-right font-mono">{entry.totalSharesEntered}</td>
                        <td className="p-4 text-right">
                          <span className={`font-mono font-bold ${isWinning ? 'text-positive' : 'text-muted-foreground'}`}>
                            ${entry.payout}
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
    </div>
  );
}
