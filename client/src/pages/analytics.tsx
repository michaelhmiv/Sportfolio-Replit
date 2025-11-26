import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, BarChart, Bar, AreaChart, Area } from "recharts";
import { TrendingUp, TrendingDown, Flame, Snowflake, BarChart3, Users, Target, GitCompare, Grid3X3, Activity, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Link } from "wouter";
import type { Player } from "@shared/schema";

interface PlayerWithStats extends Player {
  priceChangePercent?: number;
}

interface PowerRanking {
  rank: number;
  player: {
    id: string;
    firstName: string;
    lastName: string;
    team: string;
    position: string;
    lastTradePrice: string;
    volume24h: number;
    priceChange24h: string;
  };
  compositeScore: number;
  priceChange7d: number;
  avgFantasyPoints: number;
}

interface HeatmapCell {
  team: string;
  position: string;
  avgPriceChange: number;
  playerCount: number;
  topPlayer: string;
}

interface PositionRanking {
  position: string;
  players: {
    rank: number;
    player: {
      id: string;
      firstName: string;
      lastName: string;
      team: string;
      position: string;
      lastTradePrice: string;
      volume24h: number;
      priceChange24h: string;
    };
    avgFantasyPoints: number;
    priceChange7d: number;
  }[];
}

interface MarketHealth {
  transactions: number;
  transactionChange: number;
  volume: number;
  volumeChange: number;
  marketCap: number;
  marketCapChange: number;
  timeSeries: {
    date: string;
    transactions: number;
    volume: number;
    marketCap: number;
  }[];
}

interface ComparisonPlayer {
  id: string;
  name: string;
  team: string;
  position: string;
  shares: number;
  marketCap: number;
  price: number;
  volume: number;
  priceChange24h: number;
  contestUsagePercent: number;
  timesUsedInContests: number;
  priceHistory: { timestamp: string; price: number }[];
}

interface AnalyticsData {
  marketHealth: MarketHealth;
  hotPlayers: PlayerWithStats[];
  coldPlayers: PlayerWithStats[];
  powerRankings: PowerRanking[];
  heatmapData: HeatmapCell[];
  positionRankings: PositionRanking[];
  marketStats: {
    totalVolume24h: number;
    totalTrades24h: number;
    avgPriceChange: number;
    mostActiveTeam: string;
  };
}

type TimeRange = "24H" | "7D" | "30D" | "3M" | "1Y" | "All";

export default function Analytics() {
  const [timeRange, setTimeRange] = useState<TimeRange>("24H");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: analyticsData, isLoading } = useQuery<AnalyticsData>({
    queryKey: [`/api/analytics?timeRange=${timeRange}`],
  });

  const { data: comparisonData, isLoading: comparisonLoading } = useQuery<{
    players: ComparisonPlayer[];
  }>({
    queryKey: [`/api/analytics/compare?playerIds=${selectedPlayers.join(",")}&timeRange=${timeRange}`],
    enabled: selectedPlayers.length >= 1,
  });

  const { data: playersData } = useQuery<{ players: Player[] }>({
    queryKey: ["/api/players"],
  });
  const allPlayers = playersData?.players;

  const handlePlayerSelect = (playerId: string) => {
    if (selectedPlayers.includes(playerId)) {
      setSelectedPlayers(selectedPlayers.filter(id => id !== playerId));
    } else if (selectedPlayers.length < 5) {
      setSelectedPlayers([...selectedPlayers, playerId]);
    }
  };

  const chartColors = [
    "hsl(var(--primary))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ];

  const getPriceChangeColor = (change: number) => {
    if (change > 5) return "text-green-500";
    if (change > 0) return "text-green-400";
    if (change < -5) return "text-red-500";
    if (change < 0) return "text-red-400";
    return "text-muted-foreground";
  };

  const getHeatmapColor = (change: number) => {
    if (change > 10) return "bg-green-600";
    if (change > 5) return "bg-green-500";
    if (change > 0) return "bg-green-400/70";
    if (change > -5) return "bg-red-400/70";
    if (change > -10) return "bg-red-500";
    return "bg-red-600";
  };

  const formatLargeNumber = (num: number) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatPercent = (num: number) => {
    const prefix = num >= 0 ? "+" : "";
    return `${prefix}${num.toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-3 sm:p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-analytics-title">Market Analytics</h1>
            <p className="text-muted-foreground text-sm sm:text-base">Deep insights into player performance and market trends</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger className="w-28" data-testid="select-timerange">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24H">24 Hours</SelectItem>
                <SelectItem value="7D">7 Days</SelectItem>
                <SelectItem value="30D">30 Days</SelectItem>
                <SelectItem value="3M">3 Months</SelectItem>
                <SelectItem value="1Y">1 Year</SelectItem>
                <SelectItem value="All">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Market Health Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card data-testid="card-transactions">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    Transactions
                  </div>
                  <div className="text-2xl sm:text-3xl font-mono font-bold">
                    {analyticsData?.marketHealth?.transactions?.toLocaleString() || 0}
                  </div>
                </div>
                <div className={`flex items-center gap-1 text-sm ${(analyticsData?.marketHealth?.transactionChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {(analyticsData?.marketHealth?.transactionChange || 0) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {formatPercent(analyticsData?.marketHealth?.transactionChange || 0)}
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-volume">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Volume
                  </div>
                  <div className="text-2xl sm:text-3xl font-mono font-bold">
                    {formatLargeNumber(analyticsData?.marketHealth?.volume || 0)}
                  </div>
                </div>
                <div className={`flex items-center gap-1 text-sm ${(analyticsData?.marketHealth?.volumeChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {(analyticsData?.marketHealth?.volumeChange || 0) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {formatPercent(analyticsData?.marketHealth?.volumeChange || 0)}
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-market-cap">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <BarChart3 className="w-3 h-3" />
                    Market Cap
                  </div>
                  <div className="text-2xl sm:text-3xl font-mono font-bold">
                    {formatLargeNumber(analyticsData?.marketHealth?.marketCap || 0)}
                  </div>
                </div>
                <div className={`flex items-center gap-1 text-sm ${(analyticsData?.marketHealth?.marketCapChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {(analyticsData?.marketHealth?.marketCapChange || 0) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {formatPercent(analyticsData?.marketHealth?.marketCapChange || 0)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Time Series Chart */}
        {analyticsData?.marketHealth?.timeSeries && analyticsData.marketHealth.timeSeries.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Market Activity Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={analyticsData.marketHealth.timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={10}
                    tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="volume" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary) / 0.2)" 
                    name="Volume"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="w-full grid grid-cols-3 sm:grid-cols-6 h-auto">
            <TabsTrigger value="overview" className="text-xs sm:text-sm py-2" data-testid="tab-overview">
              <BarChart3 className="w-4 h-4 mr-1 hidden sm:inline" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="hot-cold" className="text-xs sm:text-sm py-2" data-testid="tab-hot-cold">
              <Flame className="w-4 h-4 mr-1 hidden sm:inline" />
              Hot/Cold
            </TabsTrigger>
            <TabsTrigger value="rankings" className="text-xs sm:text-sm py-2" data-testid="tab-rankings">
              <Target className="w-4 h-4 mr-1 hidden sm:inline" />
              Rankings
            </TabsTrigger>
            <TabsTrigger value="heatmap" className="text-xs sm:text-sm py-2" data-testid="tab-heatmap">
              <Grid3X3 className="w-4 h-4 mr-1 hidden sm:inline" />
              Heatmap
            </TabsTrigger>
            <TabsTrigger value="compare" className="text-xs sm:text-sm py-2" data-testid="tab-compare">
              <GitCompare className="w-4 h-4 mr-1 hidden sm:inline" />
              Compare
            </TabsTrigger>
            <TabsTrigger value="positions" className="text-xs sm:text-sm py-2" data-testid="tab-positions">
              <Users className="w-4 h-4 mr-1 hidden sm:inline" />
              Positions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Power Rankings - Top 10
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analyticsData?.powerRankings?.slice(0, 10).map((ranking, idx) => (
                      <Link key={ranking.player.id} href={`/player/${ranking.player.id}`}>
                        <div 
                          className="flex items-center justify-between p-2 rounded-md hover-elevate"
                          data-testid={`row-power-ranking-${idx + 1}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-lg w-6 text-right">{ranking.rank}</span>
                            <div>
                              <div className="font-medium text-sm">{ranking.player.firstName} {ranking.player.lastName}</div>
                              <div className="text-xs text-muted-foreground">{ranking.player.team} - {ranking.player.position}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold">{ranking.compositeScore.toFixed(1)}</div>
                            <div className={`text-xs ${getPriceChangeColor(ranking.priceChange7d)}`}>
                              {ranking.priceChange7d >= 0 ? "+" : ""}{ranking.priceChange7d.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </Link>
                    )) || <div className="text-sm text-muted-foreground text-center py-4">No data available</div>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Volume by Position
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analyticsData?.positionRankings && (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        data={analyticsData.positionRankings.map(pr => ({
                          position: pr.position,
                          players: pr.players.length,
                          avgPoints: pr.players.reduce((sum, p) => sum + p.avgFantasyPoints, 0) / pr.players.length || 0,
                        }))}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                        <YAxis dataKey="position" type="category" stroke="hsl(var(--muted-foreground))" fontSize={10} width={40} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px',
                            fontSize: '12px'
                          }}
                        />
                        <Bar dataKey="avgPoints" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="hot-cold" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-500" />
                    Hot Players
                    <Badge variant="outline" className="ml-auto text-xs">Trending Up</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analyticsData?.hotPlayers?.map((player, idx) => (
                      <Link key={player.id} href={`/player/${player.id}`}>
                        <div 
                          className="flex items-center justify-between p-2 rounded-md hover-elevate"
                          data-testid={`row-hot-player-${idx + 1}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                              <Flame className="w-4 h-4 text-orange-500" />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{player.firstName} {player.lastName}</div>
                              <div className="text-xs text-muted-foreground">{player.team} - {player.position}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-green-500 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              +{(player.priceChangePercent || 0).toFixed(1)}%
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ${player.lastTradePrice || player.currentPrice}
                            </div>
                          </div>
                        </div>
                      </Link>
                    )) || <div className="text-sm text-muted-foreground text-center py-4">No hot players found</div>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Snowflake className="w-4 h-4 text-blue-500" />
                    Cold Players
                    <Badge variant="outline" className="ml-auto text-xs">Trending Down</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analyticsData?.coldPlayers?.map((player, idx) => (
                      <Link key={player.id} href={`/player/${player.id}`}>
                        <div 
                          className="flex items-center justify-between p-2 rounded-md hover-elevate"
                          data-testid={`row-cold-player-${idx + 1}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                              <Snowflake className="w-4 h-4 text-blue-500" />
                            </div>
                            <div>
                              <div className="font-medium text-sm">{player.firstName} {player.lastName}</div>
                              <div className="text-xs text-muted-foreground">{player.team} - {player.position}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-red-500 flex items-center gap-1">
                              <TrendingDown className="w-3 h-3" />
                              {(player.priceChangePercent || 0).toFixed(1)}%
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ${player.lastTradePrice || player.currentPrice}
                            </div>
                          </div>
                        </div>
                      </Link>
                    )) || <div className="text-sm text-muted-foreground text-center py-4">No cold players found</div>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="rankings" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Player Power Rankings
                  <Badge variant="outline" className="ml-2 text-xs">Composite Score</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="text-left py-2 px-2">Rank</th>
                        <th className="text-left py-2 px-2">Player</th>
                        <th className="text-right py-2 px-2 hidden sm:table-cell">Price</th>
                        <th className="text-right py-2 px-2 hidden sm:table-cell">Volume</th>
                        <th className="text-right py-2 px-2 hidden sm:table-cell">Avg Fantasy</th>
                        <th className="text-right py-2 px-2">Score</th>
                        <th className="text-right py-2 px-2">7d Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsData?.powerRankings?.map((ranking) => (
                        <tr 
                          key={ranking.player.id} 
                          className="border-b hover-elevate"
                          data-testid={`row-ranking-${ranking.rank}`}
                        >
                          <td className="py-3 px-2">
                            <span className="font-mono font-bold">{ranking.rank}</span>
                          </td>
                          <td className="py-3 px-2">
                            <Link href={`/player/${ranking.player.id}`}>
                              <div className="hover:text-primary">
                                <div className="font-medium">{ranking.player.firstName} {ranking.player.lastName}</div>
                                <div className="text-xs text-muted-foreground">{ranking.player.team} - {ranking.player.position}</div>
                              </div>
                            </Link>
                          </td>
                          <td className="py-3 px-2 text-right font-mono hidden sm:table-cell">${ranking.player.lastTradePrice}</td>
                          <td className="py-3 px-2 text-right font-mono hidden sm:table-cell">{ranking.player.volume24h}</td>
                          <td className="py-3 px-2 text-right font-mono hidden sm:table-cell">{ranking.avgFantasyPoints.toFixed(1)}</td>
                          <td className="py-3 px-2 text-right font-mono font-bold">{ranking.compositeScore.toFixed(1)}</td>
                          <td className={`py-3 px-2 text-right font-mono ${getPriceChangeColor(ranking.priceChange7d)}`}>
                            {ranking.priceChange7d >= 0 ? "+" : ""}{ranking.priceChange7d.toFixed(1)}%
                          </td>
                        </tr>
                      )) || (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-muted-foreground">No rankings available</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="heatmap" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Grid3X3 className="w-4 h-4" />
                  Market Heatmap by Team & Position
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="grid grid-cols-6 gap-1 text-xs">
                      <div className="p-2 font-semibold">Team</div>
                      <div className="p-2 font-semibold text-center">PG</div>
                      <div className="p-2 font-semibold text-center">SG</div>
                      <div className="p-2 font-semibold text-center">SF</div>
                      <div className="p-2 font-semibold text-center">PF</div>
                      <div className="p-2 font-semibold text-center">C</div>
                    </div>
                    {analyticsData?.heatmapData && (() => {
                      const teams = Array.from(new Set(analyticsData.heatmapData.map(h => h.team))).sort();
                      const positions = ["PG", "SG", "SF", "PF", "C"];
                      
                      return teams.slice(0, 15).map((team) => (
                        <div key={team} className="grid grid-cols-6 gap-1 text-xs" data-testid={`row-heatmap-${team}`}>
                          <div className="p-2 font-medium">{team}</div>
                          {positions.map((pos) => {
                            const cell = analyticsData.heatmapData.find(h => h.team === team && h.position === pos);
                            const change = cell?.avgPriceChange || 0;
                            return (
                              <div 
                                key={`${team}-${pos}`}
                                className={`p-2 text-center rounded ${getHeatmapColor(change)} text-white font-mono`}
                                title={cell?.topPlayer || "No data"}
                              >
                                {change !== 0 ? `${change >= 0 ? "+" : ""}${change.toFixed(1)}%` : "-"}
                              </div>
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-4 mt-4 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-red-600 rounded"></div>
                    <span>-10%+</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-red-400/70 rounded"></div>
                    <span>-5%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-green-400/70 rounded"></div>
                    <span>+5%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 bg-green-600 rounded"></div>
                    <span>+10%+</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compare" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <GitCompare className="w-4 h-4" />
                  Player Comparison
                  <Badge variant="outline" className="ml-2 text-xs">Up to 5 players</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Select players to compare:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedPlayers.map((id) => {
                      const player = allPlayers?.find(p => p.id === id);
                      return player ? (
                        <Badge 
                          key={id} 
                          variant="secondary" 
                          className="cursor-pointer"
                          onClick={() => handlePlayerSelect(id)}
                          data-testid={`badge-selected-${id}`}
                        >
                          {player.firstName} {player.lastName}
                          <span className="ml-1 text-xs">x</span>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>

                <Select onValueChange={handlePlayerSelect}>
                  <SelectTrigger data-testid="select-player-compare">
                    <SelectValue placeholder="Add player to compare..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allPlayers?.filter(p => p.isActive && !selectedPlayers.includes(p.id))
                      .slice(0, 50)
                      .map(player => (
                        <SelectItem key={player.id} value={player.id}>
                          {player.firstName} {player.lastName} ({player.team})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                {comparisonLoading && (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                )}

                {comparisonData?.players && comparisonData.players.length > 0 && (
                  <>
                    {/* Enhanced Comparison Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b">
                          <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                            <th className="text-left py-2 px-2">Player</th>
                            <th className="text-right py-2 px-2">Price</th>
                            <th className="text-right py-2 px-2">Shares</th>
                            <th className="text-right py-2 px-2">Market Cap</th>
                            <th className="text-right py-2 px-2">Volume</th>
                            <th className="text-right py-2 px-2">Contest Usage</th>
                            <th className="text-right py-2 px-2">24h Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonData.players.map((player, idx) => (
                            <tr key={player.id} className="border-b">
                              <td className="py-3 px-2">
                                <Link href={`/player/${player.id}`}>
                                  <div className="hover:text-primary">
                                    <div className="font-medium flex items-center gap-2">
                                      <div 
                                        className="w-3 h-3 rounded-full" 
                                        style={{ backgroundColor: chartColors[idx % chartColors.length] }}
                                      ></div>
                                      {player.name}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{player.team} - {player.position}</div>
                                  </div>
                                </Link>
                              </td>
                              <td className="py-3 px-2 text-right font-mono">${player.price.toFixed(2)}</td>
                              <td className="py-3 px-2 text-right font-mono">{player.shares.toLocaleString()}</td>
                              <td className="py-3 px-2 text-right font-mono">{formatLargeNumber(player.marketCap)}</td>
                              <td className="py-3 px-2 text-right font-mono">{player.volume}</td>
                              <td className="py-3 px-2 text-right font-mono">{player.contestUsagePercent.toFixed(1)}%</td>
                              <td className={`py-3 px-2 text-right font-mono ${getPriceChangeColor(player.priceChange24h)}`}>
                                {player.priceChange24h >= 0 ? "+" : ""}{player.priceChange24h.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Price History Chart */}
                    {comparisonData.players.some(p => p.priceHistory.length > 0) && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium mb-2">Price History Comparison</h4>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis 
                              dataKey="timestamp"
                              stroke="hsl(var(--muted-foreground))" 
                              fontSize={10}
                              tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              type="category"
                              allowDuplicatedCategory={false}
                            />
                            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} domain={['auto', 'auto']} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '6px',
                                fontSize: '12px'
                              }}
                              labelFormatter={(v) => new Date(v).toLocaleDateString()}
                            />
                            <Legend />
                            {comparisonData.players.map((player, idx) => (
                              <Line
                                key={player.id}
                                data={player.priceHistory}
                                type="monotone"
                                dataKey="price"
                                name={player.name}
                                stroke={chartColors[idx % chartColors.length]}
                                strokeWidth={2}
                                dot={false}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}

                {!comparisonLoading && selectedPlayers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Select at least one player to view comparison data
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="positions" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {analyticsData?.positionRankings?.map((posRanking) => (
                <Card key={posRanking.position}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      {posRanking.position} Rankings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {posRanking.players.slice(0, 5).map((item, idx) => (
                        <Link key={item.player.id} href={`/player/${item.player.id}`}>
                          <div 
                            className="flex items-center justify-between p-2 rounded-md hover-elevate"
                            data-testid={`row-${posRanking.position}-${idx + 1}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold w-4">{item.rank}</span>
                              <div>
                                <div className="font-medium text-sm">{item.player.firstName} {item.player.lastName}</div>
                                <div className="text-xs text-muted-foreground">{item.player.team}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-sm">{item.avgFantasyPoints.toFixed(1)} FP</div>
                              <div className={`text-xs ${getPriceChangeColor(item.priceChange7d)}`}>
                                {item.priceChange7d >= 0 ? "+" : ""}{item.priceChange7d.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        </Link>
                      )) || <div className="text-sm text-muted-foreground text-center py-2">No players</div>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
