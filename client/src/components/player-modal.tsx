import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, Calendar, Users, DollarSign, Target, Activity } from "lucide-react";
import { format } from "date-fns";

interface PlayerModalProps {
  playerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SharesInfo {
  totalSharesOutstanding: number;
  currentSharePrice: string;
  marketCap: string;
  totalHolders: number;
  volume24h: number;
  priceChange24h: string;
}

interface ContestPerformance {
  totalAppearances: number;
  completedContests: number;
  totalEarnings: string;
  avgFantasyPoints: string;
  winRate: string;
}

interface SeasonStats {
  gamesPlayed: number;
  pointsPerGame: string;
  reboundsPerGame: string;
  assistsPerGame: string;
  fieldGoalPct: string;
  threePointPct: string;
  freeThrowPct: string;
  steals: number;
  blocks: number;
  minutesPerGame: string;
}

interface RecentGame {
  game: {
    id: number;
    date: string;
    opponent: string;
    isHome: boolean;
  };
  stats: {
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;
    threePointersMade: number;
    minutes: number;
    fantasyPoints: number;
  };
}

export function PlayerModal({ playerId, open, onOpenChange }: PlayerModalProps) {
  // Fetch all player data
  const { data: statsData, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/player", playerId, "stats"],
    enabled: open && !!playerId,
  });

  const { data: recentGamesData, isLoading: gamesLoading } = useQuery<any>({
    queryKey: ["/api/player", playerId, "recent-games"],
    enabled: open && !!playerId,
  });

  const { data: contestData, isLoading: contestLoading } = useQuery<any>({
    queryKey: ["/api/player", playerId, "contest-earnings"],
    enabled: open && !!playerId,
  });

  const { data: sharesData, isLoading: sharesLoading } = useQuery<any>({
    queryKey: ["/api/player", playerId, "shares-info"],
    enabled: open && !!playerId,
  });

  if (!playerId) return null;

  const player = statsData?.player;
  const team = statsData?.team;
  const stats: SeasonStats | null = statsData?.stats;
  const recentGames: RecentGame[] = recentGamesData?.recentGames || [];
  const contestPerformance: ContestPerformance | null = contestData?.contestPerformance;
  const sharesInfo: SharesInfo | null = sharesData?.sharesInfo;

  const isLoading = statsLoading || gamesLoading || contestLoading || sharesLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-player-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-player-modal-title">
            {player ? (
              <>
                <span>{player.firstName} {player.lastName}</span>
                {team && <Badge variant="secondary" data-testid="badge-team">{team.abbreviation}</Badge>}
              </>
            ) : (
              <Skeleton className="h-8 w-48" />
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="season" data-testid="tab-season">Season Stats</TabsTrigger>
            <TabsTrigger value="games" data-testid="tab-games">Recent Games</TabsTrigger>
            <TabsTrigger value="contests" data-testid="tab-contests">Contests</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Market Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Market Information
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {isLoading ? (
                  <>
                    {[...Array(6)].map((_, i) => (
                      <div key={i}>
                        <Skeleton className="h-4 w-24 mb-1" />
                        <Skeleton className="h-6 w-16" />
                      </div>
                    ))}
                  </>
                ) : sharesInfo ? (
                  <>
                    <div>
                      <div className="text-sm text-muted-foreground">Share Price</div>
                      <div className="text-2xl font-bold" data-testid="text-share-price">
                        ${sharesInfo.currentSharePrice}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Market Cap</div>
                      <div className="text-2xl font-bold" data-testid="text-market-cap">
                        ${sharesInfo.marketCap}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Total Shares</div>
                      <div className="text-2xl font-bold" data-testid="text-total-shares">
                        {sharesInfo.totalSharesOutstanding.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Holders</div>
                      <div className="text-2xl font-bold" data-testid="text-holders">
                        {sharesInfo.totalHolders}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">24h Volume</div>
                      <div className="text-2xl font-bold" data-testid="text-volume">
                        {sharesInfo.volume24h.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">24h Change</div>
                      <div 
                        className={`text-2xl font-bold ${
                          parseFloat(sharesInfo.priceChange24h) >= 0 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`}
                        data-testid="text-price-change"
                      >
                        {parseFloat(sharesInfo.priceChange24h) >= 0 ? '+' : ''}
                        {sharesInfo.priceChange24h}%
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="col-span-full text-center text-muted-foreground">
                    No market data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {isLoading ? (
                <>
                  {[...Array(4)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader className="pb-2">
                        <Skeleton className="h-4 w-16" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-8 w-12" />
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : stats ? (
                <>
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="text-sm text-muted-foreground">PPG</div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold" data-testid="text-ppg">{stats.pointsPerGame}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="text-sm text-muted-foreground">RPG</div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold" data-testid="text-rpg">{stats.reboundsPerGame}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="text-sm text-muted-foreground">APG</div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold" data-testid="text-apg">{stats.assistsPerGame}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="text-sm text-muted-foreground">Games</div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold" data-testid="text-games-played">{stats.gamesPlayed}</div>
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </div>
          </TabsContent>

          {/* Season Stats Tab */}
          <TabsContent value="season">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Season Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="flex justify-between">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </div>
                ) : stats ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Points Per Game</span>
                        <span className="font-bold" data-testid="stat-ppg">{stats.pointsPerGame}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Rebounds Per Game</span>
                        <span className="font-bold" data-testid="stat-rpg">{stats.reboundsPerGame}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Assists Per Game</span>
                        <span className="font-bold" data-testid="stat-apg">{stats.assistsPerGame}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Minutes Per Game</span>
                        <span className="font-bold" data-testid="stat-mpg">{stats.minutesPerGame}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Field Goal %</span>
                        <span className="font-bold" data-testid="stat-fg-pct">{stats.fieldGoalPct}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">3-Point %</span>
                        <span className="font-bold" data-testid="stat-3pt-pct">{stats.threePointPct}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Free Throw %</span>
                        <span className="font-bold" data-testid="stat-ft-pct">{stats.freeThrowPct}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Games Played</span>
                        <span className="font-bold" data-testid="stat-games">{stats.gamesPlayed}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No season stats available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recent Games Tab */}
          <TabsContent value="games">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Last 10 Games
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : recentGames.length > 0 ? (
                  <div className="space-y-2">
                    {recentGames.map((game: RecentGame, i: number) => (
                      <Card key={i} className="hover-elevate" data-testid={`card-game-${i}`}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">
                                  {game.game.isHome ? 'vs' : '@'} {game.game.opponent}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  {format(new Date(game.game.date), 'MMM d')}
                                </span>
                              </div>
                              <div className="grid grid-cols-4 gap-2 text-sm">
                                <div>
                                  <div className="text-muted-foreground">PTS</div>
                                  <div className="font-bold">{game.stats.points}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">REB</div>
                                  <div className="font-bold">{game.stats.rebounds}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">AST</div>
                                  <div className="font-bold">{game.stats.assists}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">MIN</div>
                                  <div className="font-bold">{game.stats.minutes}</div>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-muted-foreground">Fantasy Pts</div>
                              <div className="text-2xl font-bold text-primary">
                                {game.stats.fantasyPoints.toFixed(1)}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No recent games available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contests Tab */}
          <TabsContent value="contests">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Contest Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[...Array(4)].map((_, i) => (
                        <div key={i}>
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-6 w-16" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : contestPerformance ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div>
                        <div className="text-sm text-muted-foreground">Total Earnings</div>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-total-earnings">
                          ${contestPerformance.totalEarnings}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Appearances</div>
                        <div className="text-2xl font-bold" data-testid="text-appearances">
                          {contestPerformance.totalAppearances}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Avg Fantasy Pts</div>
                        <div className="text-2xl font-bold" data-testid="text-avg-fp">
                          {contestPerformance.avgFantasyPoints}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Win Rate</div>
                        <div className="text-2xl font-bold" data-testid="text-win-rate">
                          {contestPerformance.winRate}%
                        </div>
                      </div>
                    </div>
                    {contestData?.recentContests && contestData.recentContests.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Recent Contest Entries</h4>
                        <div className="space-y-2">
                          {contestData.recentContests.map((contest: any, i: number) => (
                            <Card key={i} className="hover-elevate" data-testid={`card-contest-${i}`}>
                              <CardContent className="p-4">
                                <div className="flex justify-between items-center">
                                  <div>
                                    <div className="font-medium">{contest.contestName}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {format(new Date(contest.contestDate), 'MMM d, yyyy')}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold">{contest.fantasyPoints} FP</div>
                                    {contest.entryPayout && parseFloat(contest.entryPayout) > 0 && (
                                      <div className="text-sm text-green-600 dark:text-green-400">
                                        +${contest.entryPayout}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No contest data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
