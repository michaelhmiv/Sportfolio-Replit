import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface PlayerModalProps {
  playerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SharesInfo {
  totalSharesOutstanding: number;
  currentSharePrice: string | null;
  marketCap: string | null;
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
  const [gamesToShow, setGamesToShow] = useState(5);
  
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
  
  // Show most recent games first
  const reversedGames = [...recentGames].reverse();
  const displayedGames = reversedGames.slice(0, gamesToShow);
  const hasMoreGames = reversedGames.length > gamesToShow;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-3" data-testid="dialog-player-modal">
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center gap-2 text-base" data-testid="text-player-modal-title">
            {player ? (
              <>
                <span>{player.firstName} {player.lastName}</span>
                {team && <Badge variant="secondary" className="text-xs h-5" data-testid="badge-team">{team.abbreviation}</Badge>}
              </>
            ) : (
              <Skeleton className="h-5 w-48" />
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {/* Market Info - Compact Grid */}
          <div className="border rounded-md p-2">
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingUp className="h-3 w-3" />
              <span className="text-xs font-semibold">Market</span>
            </div>
            {isLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i}>
                    <Skeleton className="h-2 w-16 mb-0.5" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ) : sharesInfo ? (
              <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
                <div>
                  <div className="text-muted-foreground text-[10px]">Price</div>
                  <div className="font-bold" data-testid="text-share-price">
                    {sharesInfo.currentSharePrice ? `$${sharesInfo.currentSharePrice}` : <span className="text-muted-foreground text-[10px] font-normal">-</span>}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Market Cap</div>
                  <div className="font-bold" data-testid="text-market-cap">
                    {sharesInfo.marketCap ? `$${sharesInfo.marketCap}` : <span className="text-muted-foreground text-[10px] font-normal">-</span>}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Shares</div>
                  <div className="font-bold" data-testid="text-total-shares">{sharesInfo.totalSharesOutstanding.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Holders</div>
                  <div className="font-bold" data-testid="text-holders">{sharesInfo.totalHolders}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">24h Vol</div>
                  <div className="font-bold" data-testid="text-volume">{sharesInfo.volume24h.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">24h Chg</div>
                  <div 
                    className={`font-bold ${
                      parseFloat(sharesInfo.priceChange24h) >= 0 
                        ? 'text-positive' 
                        : 'text-negative'
                    }`}
                    data-testid="text-price-change"
                  >
                    {parseFloat(sharesInfo.priceChange24h) >= 0 ? '+' : ''}
                    {sharesInfo.priceChange24h}%
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-xs text-muted-foreground py-2">No data</div>
            )}
          </div>

          {/* Season Stats - Compact List */}
          <div className="border rounded-md p-2">
            <div className="text-xs font-semibold mb-1.5">Season Stats</div>
            {isLoading ? (
              <div className="space-y-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                ))}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">FP/G</span>
                  <span className="font-bold text-primary" data-testid="stat-avg-fp">{stats.avgFantasyPointsPerGame}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">FG%</span>
                  <span className="font-bold" data-testid="stat-fg-pct">{stats.fieldGoalPct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PPG</span>
                  <span className="font-bold" data-testid="stat-ppg">{stats.pointsPerGame}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">3P%</span>
                  <span className="font-bold" data-testid="stat-3pt-pct">{stats.threePointPct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">RPG</span>
                  <span className="font-bold" data-testid="stat-rpg">{stats.reboundsPerGame}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">FT%</span>
                  <span className="font-bold" data-testid="stat-ft-pct">{stats.freeThrowPct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">APG</span>
                  <span className="font-bold" data-testid="stat-apg">{stats.assistsPerGame}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">MPG</span>
                  <span className="font-bold" data-testid="stat-mpg">{stats.minutesPerGame}</span>
                </div>
              </div>
            ) : (
              <div className="text-center text-xs text-muted-foreground py-2">No stats</div>
            )}
          </div>

          {/* Recent Games - Expandable List */}
          <div className="border rounded-md p-2">
            <div className="text-xs font-semibold mb-1.5">Recent Games</div>
            {isLoading ? (
              <div className="space-y-1">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : displayedGames.length > 0 ? (
              <>
                <div className="space-y-1">
                  {displayedGames.map((game: RecentGame, i: number) => (
                    <div key={i} className="border rounded p-1.5 hover-elevate" data-testid={`card-game-${i}`}>
                      <div className="flex justify-between items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-medium">
                              {game.game.isHome ? 'vs' : '@'} {game.game.opponent}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(game.game.date), 'MMM d')}
                            </span>
                          </div>
                          <div className="flex gap-2 text-[10px]">
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
                          <div className="text-[10px] text-muted-foreground">FP</div>
                          <div className="text-base font-bold text-primary">
                            {game.stats.fantasyPoints.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {hasMoreGames && (
                  <div className="mt-1.5 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => setGamesToShow(gamesToShow + 5)}
                      data-testid="button-see-more-games"
                    >
                      See more
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-xs text-muted-foreground py-2">No games</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
