import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, Trophy, Clock, DollarSign, Pickaxe, Calendar } from "lucide-react";
import { Link } from "wouter";
import type { Player, Mining, Contest, Trade, DailyGame } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DashboardData {
  user: {
    balance: string;
    portfolioValue: string;
  };
  hotPlayers: Player[];
  mining: Mining & { player?: Player; capLimit: number; sharesPerHour: number };
  contests: Contest[];
  recentTrades: (Trade & { player: Player })[];
  portfolioHistory: { date: string; value: number }[];
  topHoldings: { player: Player; quantity: number; value: string; pnl: string; pnlPercent: string }[];
}

export default function Dashboard() {
  const { toast } = useToast();
  const [showPlayerSelection, setShowPlayerSelection] = useState(false);
  
  // WebSocket connection for live updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      console.log('[WebSocket] Connected to live updates');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[WebSocket] Received:', message);

        // Handle different message types
        if (message.type === 'liveStats') {
          // Invalidate relevant queries to refresh data
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["/api/games/today"] });
        } else if (message.type === 'portfolio') {
          queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        } else if (message.type === 'mining') {
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        } else if (message.type === 'orderBook' || message.type === 'trade') {
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        }
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected');
    };

    return () => {
      ws.close();
    };
  }, []);
  
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  const { data: playersData } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    enabled: showPlayerSelection,
  });

  const { data: todayGames } = useQuery<DailyGame[]>({
    queryKey: ["/api/games/today"],
  });

  const startMiningMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return await apiRequest("POST", "/api/mining/start", { playerId });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setShowPlayerSelection(false);
      toast({
        title: "Mining Started!",
        description: `Now mining shares of ${data.player.firstName} ${data.player.lastName}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Start Mining",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const claimMiningMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/mining/claim");
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      toast({
        title: "Shares Claimed!",
        description: `Successfully claimed ${data.sharesClaimed} shares of ${data.player.firstName} ${data.player.lastName}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Claim Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Market Ticker */}
      <div className="border-b bg-card">
        <div className="h-12 overflow-hidden relative">
          <div className="flex gap-6 animate-slide-left absolute whitespace-nowrap py-3 px-4">
            {data?.hotPlayers?.concat(data.hotPlayers).map((player, idx) => (
              <Link key={`${player.id}-${idx}`} href={`/player/${player.id}`}>
                <div className="inline-flex items-center gap-2 hover-elevate px-3 py-1 rounded-md">
                  <span className="font-medium">{player.firstName} {player.lastName}</span>
                  <span className="font-mono font-bold">${player.currentPrice}</span>
                  <span className={`flex items-center text-sm ${parseFloat(player.priceChange24h) >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {parseFloat(player.priceChange24h) >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    {parseFloat(player.priceChange24h) >= 0 ? '+' : ''}{player.priceChange24h}%
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Balance Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-sm text-muted-foreground uppercase tracking-wide mb-1">Cash Balance</div>
                <div className="text-2xl font-mono font-bold" data-testid="text-balance">${data?.user.balance || "0.00"}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground uppercase tracking-wide mb-1">Portfolio Value</div>
                <div className="text-2xl font-mono font-bold" data-testid="text-portfolio-value">${data?.user.portfolioValue || "0.00"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Today's Games */}
        {todayGames && todayGames.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">Today's Games</CardTitle>
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {todayGames.map((game) => (
                  <div
                    key={game.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted hover-elevate"
                    data-testid={`game-${game.gameId}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{game.awayTeam}</span>
                        <span className="text-xs text-muted-foreground">@</span>
                        <span className="font-medium text-sm">{game.homeTeam}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(game.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                        <Badge 
                          variant={game.status === 'inprogress' ? 'default' : game.status === 'completed' ? 'secondary' : 'outline'}
                          className="text-xs"
                        >
                          {game.status === 'inprogress' ? 'LIVE' : game.status === 'completed' ? 'Final' : 'Scheduled'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Widgets Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Mining Widget */}
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">Mining</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Rate: {data?.mining?.sharesPerHour || 100} sh/hr</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {data?.mining?.sharesAccumulated || 0} / {data?.mining?.capLimit || 2400}
                  </span>
                </div>
                <Progress 
                  value={((data?.mining?.sharesAccumulated || 0) / (data?.mining?.capLimit || 2400)) * 100} 
                  className="h-2"
                  data-testid="progress-mining"
                />
              </div>
              
              {data?.mining?.player ? (
                <>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold">{data.mining.player.firstName[0]}{data.mining.player.lastName[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{data.mining.player.firstName} {data.mining.player.lastName}</div>
                      <div className="text-xs text-muted-foreground">{data.mining.player.team} · {data.mining.player.position}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowPlayerSelection(true)}
                      data-testid="button-change-mining-player"
                      className="flex-shrink-0"
                    >
                      Change
                    </Button>
                  </div>
                  
                  <Button 
                    className="w-full" 
                    size="lg"
                    disabled={!data?.mining?.sharesAccumulated || claimMiningMutation.isPending}
                    onClick={() => claimMiningMutation.mutate()}
                    data-testid="button-claim-mining"
                  >
                    {claimMiningMutation.isPending ? "Claiming..." : `Claim ${data?.mining?.sharesAccumulated || 0} Shares`}
                  </Button>
                </>
              ) : (
                <div className="text-center py-4">
                  <Pickaxe className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-4">No player selected for mining</p>
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={() => setShowPlayerSelection(true)}
                    data-testid="button-select-mining-player"
                  >
                    Select Player to Mine
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contest Summary */}
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">Contests</CardTitle>
              <Trophy className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              {data?.contests?.slice(0, 3).map((contest) => (
                <div key={contest.id} className="p-3 border rounded-md hover-elevate">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-sm">{contest.name}</div>
                      <Badge variant="outline" className="text-xs mt-1">{contest.sport}</Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-mono font-bold text-primary">${contest.totalPrizePool}</div>
                      <div className="text-xs text-muted-foreground">{contest.entryCount} entries</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{contest.totalSharesEntered} shares entered</div>
                </div>
              ))}
              <Link href="/contests">
                <Button variant="outline" className="w-full" data-testid="button-view-contests">
                  View All Contests
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Portfolio Summary */}
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">Top Holdings</CardTitle>
              <DollarSign className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              {data?.topHoldings?.slice(0, 3).map((holding) => (
                <Link key={holding.player.id} href={`/player/${holding.player.id}`}>
                  <div className="p-2 rounded-md hover-elevate">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{holding.player.firstName} {holding.player.lastName}</span>
                      <span className="font-mono font-bold text-sm">${holding.value}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{holding.quantity} shares</span>
                      <span className={parseFloat(holding.pnl) >= 0 ? 'text-positive' : 'text-negative'}>
                        {parseFloat(holding.pnl) >= 0 ? '+' : ''}${holding.pnl} ({holding.pnlPercent}%)
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
              <Link href="/portfolio">
                <Button variant="outline" className="w-full" data-testid="button-view-portfolio">
                  View Full Portfolio
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Market Activity */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wide">Recent Market Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data?.recentTrades?.map((trade) => (
                  <div key={trade.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-bold">{trade.player.firstName[0]}{trade.player.lastName[0]}</span>
                      </div>
                      <div>
                        <div className="font-medium text-sm">{trade.player.firstName} {trade.player.lastName}</div>
                        <div className="text-xs text-muted-foreground">{trade.player.team}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold">${trade.price}</div>
                      <div className="text-xs text-muted-foreground">{trade.quantity} shares</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Player Selection Dialog */}
      <Dialog open={showPlayerSelection} onOpenChange={setShowPlayerSelection}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Player to Mine</DialogTitle>
            <DialogDescription>
              Choose a player to start mining shares. You'll accumulate {data?.user?.balance && parseFloat(data.user.balance) > 1000 ? "200" : "100"} shares per hour up to a {data?.user?.balance && parseFloat(data.user.balance) > 1000 ? "33,600" : "2,400"} share cap.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1">
              {playersData?.filter(p => p.isEligibleForMining).map((player) => (
                <Card 
                  key={player.id} 
                  className="hover-elevate cursor-pointer"
                  onClick={() => startMiningMutation.mutate(player.id)}
                  data-testid={`card-select-player-${player.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold">{player.firstName[0]}{player.lastName[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{player.firstName} {player.lastName}</div>
                        <div className="text-sm text-muted-foreground">{player.team} · {player.position}</div>
                        <div className="text-xs font-mono font-bold mt-1">${player.currentPrice}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {playersData?.filter(p => p.isEligibleForMining).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No players available for mining at this time.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
