import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Trophy, Clock, DollarSign } from "lucide-react";
import { Link } from "wouter";
import type { Player, Mining, Contest, Trade } from "@shared/schema";

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
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
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
              
              {data?.mining?.player && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-bold">{data.mining.player.firstName[0]}{data.mining.player.lastName[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{data.mining.player.firstName} {data.mining.player.lastName}</div>
                    <div className="text-xs text-muted-foreground">{data.mining.player.team} · {data.mining.player.position}</div>
                  </div>
                </div>
              )}
              
              <Button 
                className="w-full" 
                size="lg"
                disabled={!data?.mining?.sharesAccumulated}
                data-testid="button-claim-mining"
              >
                Claim {data?.mining?.sharesAccumulated || 0} Shares
              </Button>
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
    </div>
  );
}
