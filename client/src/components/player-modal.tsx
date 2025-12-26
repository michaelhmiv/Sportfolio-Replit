import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  ArrowRight,
  Gift,
  Flame,
  Snowflake,
  Activity,
  Zap,
  TicketPercent
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useVesting } from "@/lib/vesting-context";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PlayerModalProps {
  playerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PlayerFinancialMetrics {
  peRatio: number;
  valueIndex: number;
  isUndervalued: boolean;
  sentiment: {
    buyPressure: number;
    totalVolume24h: number;
    trend: 'bullish' | 'bearish' | 'neutral';
  };
  heatCheck: {
    l5Avg: number;
    seasonAvg: number;
    status: 'fire' | 'ice' | 'neutral';
  };
  marketCapRank: {
    tier: 'blue_chip' | 'mid_cap' | 'moonshot';
    percentile: number;
  };
}

// Sport configuration for dynamic display
const SPORT_CONFIG: Record<string, {
  seasonStats: { key: string; label: string; highlight?: boolean; format?: (val: any) => string }[];
  recentGames: { key: string; label: string; format?: (val: any) => string }[];
}> = {
  NBA: {
    seasonStats: [
      { key: "avgFantasyPointsPerGame", label: "FP/G", highlight: true },
      { key: "fieldGoalPct", label: "FG%", format: (v) => `${v}%` },
      { key: "pointsPerGame", label: "PPG" },
      { key: "threePointPct", label: "3P%", format: (v) => `${v}%` },
      { key: "reboundsPerGame", label: "RPG" },
      { key: "freeThrowPct", label: "FT%", format: (v) => `${v}%` },
      { key: "assistsPerGame", label: "APG" },
      { key: "minutesPerGame", label: "MPG" },
    ],
    recentGames: [
      { key: "points", label: "PTS" },
      { key: "rebounds", label: "REB" },
      { key: "assists", label: "AST" },
    ]
  },
  NFL: {
    seasonStats: [
      { key: "avgFantasyPointsPerGame", label: "FP/G", highlight: true },
      { key: "gamesPlayed", label: "GP" },
      { key: "passingYards", label: "Pas Yds" },
      { key: "passingTouchdowns", label: "Pas TD" },
      { key: "rushingYards", label: "Rus Yds" },
      { key: "rushingTouchdowns", label: "Rus TD" },
      { key: "receivingYards", label: "Rec Yds" },
      { key: "receivingTouchdowns", label: "Rec TD" },
    ],
    recentGames: [
      { key: "passingYards", label: "P.YDS" },
      { key: "rushingYards", label: "R.YDS" },
      { key: "receivingYards", label: "R.YDS" },
    ]
  }
};

interface RecentGame {
  game: {
    id: number;
    date: string;
    opponent: string;
    isHome: boolean;
  };
  stats: Record<string, any>;
  sport?: string;
}

export function PlayerModal({ playerId, open, onOpenChange }: PlayerModalProps) {
  const [gamesToShow, setGamesToShow] = useState(5);
  const { isAuthenticated } = useAuth();
  const { openRedemptionModal } = useVesting();

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

  const { data: financialMetrics, isLoading: financialsLoading } = useQuery<PlayerFinancialMetrics>({
    queryKey: ["/api/player", playerId, "financials"],
    enabled: open && !!playerId,
  });

  if (!playerId) return null;

  const player = statsData?.player;
  const team = statsData?.team;
  const sport = statsData?.stats?.sport || (player?.sport === 'NFL' ? 'NFL' : 'NBA');
  const stats = statsData?.stats;
  const recentGames: RecentGame[] = recentGamesData?.recentGames || [];
  const sharesInfo: any = sharesData?.sharesInfo;

  const isLoading = statsLoading || gamesLoading || sharesLoading || financialsLoading;
  const displayedGames = recentGames.slice(0, gamesToShow);
  const hasMoreGames = recentGames.length > gamesToShow;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-3" data-testid="dialog-player-modal">
        <DialogHeader className="pb-1">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-base" data-testid="text-player-modal-title">
              {player ? (
                <>
                  <span>{player.firstName} {player.lastName}</span>
                  {team && <Badge variant="secondary" className="text-xs h-5" data-testid="badge-team">{team.abbreviation}</Badge>}

                  {/* Heat Check Badge */}
                  {!isLoading && financialMetrics?.heatCheck?.status === 'fire' && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center text-orange-500 animate-pulse cursor-help">
                            <Flame className="w-4 h-4 fill-orange-500" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Heating Up: Last 5 games are 15% above season avg</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {!isLoading && financialMetrics?.heatCheck?.status === 'ice' && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center text-blue-400 cursor-help">
                            <Snowflake className="w-4 h-4" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Cold Streak: Last 5 games are 15% below season avg</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </>
              ) : (
                <Skeleton className="h-5 w-48" />
              )}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {playerId && isAuthenticated && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    openRedemptionModal([playerId]);
                    onOpenChange(false);
                  }}
                  data-testid="button-vest-player"
                >
                  <Gift className="w-4 h-4 mr-1" />
                  Vest
                </Button>
              )}
              {playerId && (
                <Link href={`/player/${playerId}`} onClick={() => onOpenChange(false)}>
                  <Button size="sm" data-testid="button-trade-player">
                    Trade
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2">
          {/* --- NEW: Financial Health Bar --- */}
          {!isLoading && financialMetrics && (
            <div className="grid grid-cols-2 gap-2">
              {/* Value Index Card */}
              <div className="border rounded-md p-2 bg-accent/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Value Index</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <TicketPercent className="w-3 h-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>P/E Index (Base 100). Lower is Cheaper relative to League Avg.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold">
                    {financialMetrics.valueIndex !== undefined && financialMetrics.valueIndex !== null
                      ? financialMetrics.valueIndex.toFixed(0)
                      : "N/A"}
                  </span>
                  {(financialMetrics.valueIndex || 0) < 100 ? (
                    <Badge variant="default" className="bg-green-500/15 text-green-600 hover:bg-green-500/25 border-green-500/20 text-[10px] px-1.5 h-5">
                      🔥 Undervalued
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-red-500 border-red-500/30 text-[10px] px-1.5 h-5 bg-red-500/5">
                      Premium
                    </Badge>
                  )}
                </div>
              </div>

              {/* Sentiment Gauge */}
              <div className="border rounded-md p-2 bg-accent/5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Trader Sentiment</span>
                  <span className={`text-[10px] font-bold ${financialMetrics.sentiment?.trend === 'bullish' ? 'text-green-500' :
                    financialMetrics.sentiment?.trend === 'bearish' ? 'text-red-500' : 'text-yellow-500'
                    }`}>
                    {financialMetrics.sentiment?.buyPressure?.toFixed(0) || 0}% Buy Vol
                  </span>
                </div>
                <Progress
                  value={financialMetrics.sentiment?.buyPressure || 0}
                  className="h-1.5 bg-red-100 dark:bg-red-950/30"
                  indicatorClassName="bg-gradient-to-r from-red-500 via-yellow-400 to-green-500"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[8px] text-muted-foreground">Bearish</span>
                  <span className="text-[8px] text-muted-foreground">Bullish</span>
                </div>
              </div>
            </div>
          )}

          {/* Market Info - Compact Grid */}
          <div className="border rounded-md p-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                <span className="text-xs font-semibold">Market Data</span>
              </div>
              {!isLoading && financialMetrics?.marketCapRank && (
                <Badge variant="secondary" className="text-[10px] h-4 font-normal bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  {financialMetrics.marketCapRank.tier === 'blue_chip' ? '🐋 Blue Chip' :
                    financialMetrics.marketCapRank.tier === 'mid_cap' ? '🏢 Mid Cap' : '🌑 Moonshot'}
                </Badge>
              )}
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
                    className={`font-bold ${parseFloat(sharesInfo.priceChange24h) >= 0
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
                {(SPORT_CONFIG[sport]?.seasonStats || SPORT_CONFIG.NBA.seasonStats).map((statConfig) => {
                  const value = stats[statConfig.key];
                  if (value === undefined || value === null) return null;

                  return (
                    <div key={statConfig.key} className="flex justify-between">
                      <span className="text-muted-foreground">{statConfig.label}</span>
                      <span
                        className={`font-bold ${statConfig.highlight ? "text-primary" : ""}`}
                        data-testid={`stat-${statConfig.key}`}
                      >
                        {statConfig.format ? statConfig.format(value) : value}
                      </span>
                    </div>
                  );
                })}
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
                            {(SPORT_CONFIG[sport]?.recentGames || SPORT_CONFIG.NBA.recentGames).map((statConfig) => {
                              const value = game.stats[statConfig.key];
                              // Skip 0 values for cleaner look, unless it's a key stat
                              if (!value) return null;

                              return (
                                <span key={statConfig.key} className="text-muted-foreground">
                                  <span className="font-semibold text-foreground">{value}</span> {statConfig.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-[10px] text-muted-foreground">FP</div>
                          <div className="text-sm font-bold text-primary">
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
