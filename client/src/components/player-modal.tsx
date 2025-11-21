import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Calendar, Activity } from "lucide-react";
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

interface SeasonStats {
  gamesPlayed: number;
  avgFantasyPointsPerGame: string;
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

  const { data: sharesData, isLoading: sharesLoading } = useQuery<any>({
    queryKey: ["/api/player", playerId, "shares-info"],
    enabled: open && !!playerId,
  });

  if (!playerId) return null;

  const player = statsData?.player;
  const team = statsData?.team;
  const stats: SeasonStats | null = statsData?.stats;
  const recentGames: RecentGame[] = recentGamesData?.recentGames || [];
  const sharesInfo: SharesInfo | null = sharesData?.sharesInfo;

  const isLoading = statsLoading || gamesLoading || sharesLoading;
  
  // Show only first 5 games in modal, rest available via link
  const displayedGames = recentGames.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-player-modal">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg" data-testid="text-player-modal-title">
            {player ? (
              <>
                <span>{player.firstName} {player.lastName}</span>
                {team && <Badge variant="secondary" className="text-xs" data-testid="badge-team">{team.abbreviation}</Badge>}
              </>
            ) : (
              <Skeleton className="h-6 w-48" />
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" className="text-sm" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="season" className="text-sm" data-testid="tab-season">Season Stats</TabsTrigger>
            <TabsTrigger value="games" className="text-sm" data-testid="tab-games">Recent Games</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-3">
            {/* Market Info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <TrendingUp className="h-4 w-4" />
                  Market Information
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                {isLoading ? (
                  <>
                    {[...Array(6)].map((_, i) => (
                      <div key={i}>
                        <Skeleton className="h-3 w-20 mb-1" />
                        <Skeleton className="h-5 w-14" />
                      </div>
                    ))}
                  </>
                ) : sharesInfo ? (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Share Price</div>
                      <div className="text-lg font-bold" data-testid="text-share-price">
                        ${sharesInfo.currentSharePrice}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Market Cap</div>
                      <div className="text-lg font-bold" data-testid="text-market-cap">
                        ${sharesInfo.marketCap}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Total Shares</div>
                      <div className="text-lg font-bold" data-testid="text-total-shares">
                        {sharesInfo.totalSharesOutstanding.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Holders</div>
                      <div className="text-lg font-bold" data-testid="text-holders">
                        {sharesInfo.totalHolders}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">24h Volume</div>
                      <div className="text-lg font-bold" data-testid="text-volume">
                        {sharesInfo.volume24h.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">24h Change</div>
                      <div 
                        className={`text-lg font-bold ${
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
                  <div className="col-span-full text-center text-sm text-muted-foreground">
                    No market data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {isLoading ? (
                <>
                  {[...Array(4)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader className="pb-1">
                        <Skeleton className="h-3 w-14" />
                      </CardHeader>
                      <CardContent className="pt-1">
                        <Skeleton className="h-6 w-10" />
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : stats ? (
                <>
                  <Card>
                    <CardHeader className="pb-1">
                      <div className="text-xs text-muted-foreground">PPG</div>
                    </CardHeader>
                    <CardContent className="pt-1">
                      <div className="text-xl font-bold" data-testid="text-ppg">{stats.pointsPerGame}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-1">
                      <div className="text-xs text-muted-foreground">RPG</div>
                    </CardHeader>
                    <CardContent className="pt-1">
                      <div className="text-xl font-bold" data-testid="text-rpg">{stats.reboundsPerGame}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-1">
                      <div className="text-xs text-muted-foreground">APG</div>
                    </CardHeader>
                    <CardContent className="pt-1">
                      <div className="text-xl font-bold" data-testid="text-apg">{stats.assistsPerGame}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-1">
                      <div className="text-xs text-muted-foreground">FP/G</div>
                    </CardHeader>
                    <CardContent className="pt-1">
                      <div className="text-xl font-bold text-primary" data-testid="text-fpg">{stats.avgFantasyPointsPerGame}</div>
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </div>
          </TabsContent>

          {/* Season Stats Tab */}
          <TabsContent value="season">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <Activity className="h-4 w-4" />
                  Season Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {isLoading ? (
                  <div className="space-y-1.5">
                    {[...Array(9)].map((_, i) => (
                      <div key={i} className="flex justify-between">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                    ))}
                  </div>
                ) : stats ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Avg Fantasy Pts/G</span>
                        <span className="font-bold text-primary" data-testid="stat-avg-fp">{stats.avgFantasyPointsPerGame}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Points Per Game</span>
                        <span className="font-bold" data-testid="stat-ppg">{stats.pointsPerGame}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Rebounds Per Game</span>
                        <span className="font-bold" data-testid="stat-rpg">{stats.reboundsPerGame}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Assists Per Game</span>
                        <span className="font-bold" data-testid="stat-apg">{stats.assistsPerGame}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Minutes Per Game</span>
                        <span className="font-bold" data-testid="stat-mpg">{stats.minutesPerGame}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Field Goal %</span>
                        <span className="font-bold" data-testid="stat-fg-pct">{stats.fieldGoalPct}%</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">3-Point %</span>
                        <span className="font-bold" data-testid="stat-3pt-pct">{stats.threePointPct}%</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Free Throw %</span>
                        <span className="font-bold" data-testid="stat-ft-pct">{stats.freeThrowPct}%</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Steals</span>
                        <span className="font-bold" data-testid="stat-steals">{stats.steals}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Blocks</span>
                        <span className="font-bold" data-testid="stat-blocks">{stats.blocks}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-sm text-muted-foreground py-6">
                    No season stats available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recent Games Tab */}
          <TabsContent value="games">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <Calendar className="h-4 w-4" />
                  Recent Games
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {isLoading ? (
                  <div className="space-y-1.5">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : displayedGames.length > 0 ? (
                  <>
                    <div className="space-y-1.5">
                      {displayedGames.map((game: RecentGame, i: number) => (
                        <div key={i} className="border rounded p-2 hover-elevate" data-testid={`card-game-${i}`}>
                          <div className="flex justify-between items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-medium">
                                  {game.game.isHome ? 'vs' : '@'} {game.game.opponent}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(game.game.date), 'MMM d')}
                                </span>
                              </div>
                              <div className="flex gap-3 text-xs">
                                <span className="text-muted-foreground">
                                  <span className="font-semibold text-foreground">{game.stats.points}</span> PTS
                                </span>
                                <span className="text-muted-foreground">
                                  <span className="font-semibold text-foreground">{game.stats.rebounds}</span> REB
                                </span>
                                <span className="text-muted-foreground">
                                  <span className="font-semibold text-foreground">{game.stats.assists}</span> AST
                                </span>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-xs text-muted-foreground">FP</div>
                              <div className="text-lg font-bold text-primary">
                                {game.stats.fantasyPoints.toFixed(1)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {recentGames.length > 5 && (
                      <div className="mt-3 text-center">
                        <a 
                          href={`/player/${playerId}`} 
                          className="text-sm text-primary hover:underline"
                          data-testid="link-see-more-games"
                        >
                          See all {recentGames.length} games →
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-sm text-muted-foreground py-6">
                    No recent games available
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
