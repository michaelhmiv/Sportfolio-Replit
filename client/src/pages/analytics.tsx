import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, BarChart, Bar, AreaChart, Area, ComposedChart } from "recharts";
import { BarChart3, Users, Target, GitCompare, Activity, DollarSign, ArrowUpRight, ArrowDownRight, Pickaxe, Flame, Coins } from "lucide-react";
import { Link } from "wouter";
import type { Player } from "@shared/schema";

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
  sharesMined: number;
  sharesBurned: number;
  totalShares: number;
  periodSharesMined: number;
  periodSharesBurned: number;
  timeSeries: {
    date: string;
    transactions: number;
    volume: number;
    marketCap: number;
  }[];
  shareEconomyTimeSeries: {
    date: string;
    sharesMined: number;
    sharesBurned: number;
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
  powerRankings: PowerRanking[];
  positionRankings: PositionRanking[];
  marketStats: {
    totalVolume24h: number;
    totalTrades24h: number;
    avgPriceChange: number;
    mostActiveTeam: string;
  };
}

type TimeRange = "7D" | "30D" | "3M" | "1Y" | "All";
type MetricType = "marketCap" | "transactions" | "volume" | "sharesMined" | "sharesBurned" | "totalShares";

interface MarketSnapshot {
  date: string;
  marketCap: number;
  transactions: number;
  volume: number;
  sharesMined: number;
  sharesBurned: number;
  totalShares: number;
}

interface SnapshotsResponse {
  timeRange: string;
  startDate: string;
  endDate: string;
  snapshots: MarketSnapshot[];
}

export default function Analytics() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30D");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("marketCap");

  const { data: analyticsData, isLoading } = useQuery<AnalyticsData>({
    queryKey: [`/api/analytics?timeRange=${timeRange}`],
    refetchInterval: 30000,
  });

  const { data: snapshotsData } = useQuery<SnapshotsResponse>({
    queryKey: [`/api/analytics/snapshots?timeRange=${timeRange}`],
    refetchInterval: 60000,
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

  const formatLargeNumber = (num: number) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
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

  const mh = analyticsData?.marketHealth;

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="hidden sm:block text-2xl sm:text-3xl font-bold" data-testid="text-analytics-title">Market Analytics</h1>
            <p className="text-muted-foreground text-sm sm:text-base">Market health and player insights</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger className="w-28" data-testid="select-timerange">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7D">7 Days</SelectItem>
                <SelectItem value="30D">30 Days</SelectItem>
                <SelectItem value="3M">3 Months</SelectItem>
                <SelectItem value="1Y">1 Year</SelectItem>
                <SelectItem value="All">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Market Health Dashboard - 6 Clickable Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Market Cap - First and Default */}
          <Card 
            data-testid="card-market-cap"
            className={`cursor-pointer transition-all ${selectedMetric === 'marketCap' ? 'ring-2 ring-primary' : 'hover-elevate'}`}
            onClick={() => setSelectedMetric('marketCap')}
          >
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />
                  Market Cap
                </div>
                <div className="text-xl sm:text-2xl font-mono font-bold">
                  {formatLargeNumber(mh?.marketCap || 0)}
                </div>
                <div className={`flex items-center gap-1 text-xs ${(mh?.marketCapChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {(mh?.marketCapChange || 0) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {formatPercent(mh?.marketCapChange || 0)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transactions */}
          <Card 
            data-testid="card-transactions"
            className={`cursor-pointer transition-all ${selectedMetric === 'transactions' ? 'ring-2 ring-primary' : 'hover-elevate'}`}
            onClick={() => setSelectedMetric('transactions')}
          >
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Transactions
                </div>
                <div className="text-xl sm:text-2xl font-mono font-bold">
                  {mh?.transactions?.toLocaleString() || 0}
                </div>
                <div className={`flex items-center gap-1 text-xs ${(mh?.transactionChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {(mh?.transactionChange || 0) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {formatPercent(mh?.transactionChange || 0)}
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Volume */}
          <Card 
            data-testid="card-volume"
            className={`cursor-pointer transition-all ${selectedMetric === 'volume' ? 'ring-2 ring-primary' : 'hover-elevate'}`}
            onClick={() => setSelectedMetric('volume')}
          >
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Volume
                </div>
                <div className="text-xl sm:text-2xl font-mono font-bold">
                  {formatLargeNumber(mh?.volume || 0)}
                </div>
                <div className={`flex items-center gap-1 text-xs ${(mh?.volumeChange || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {(mh?.volumeChange || 0) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {formatPercent(mh?.volumeChange || 0)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Shares Mined */}
          <Card 
            data-testid="card-shares-mined"
            className={`cursor-pointer transition-all ${selectedMetric === 'sharesMined' ? 'ring-2 ring-primary' : 'hover-elevate'}`}
            onClick={() => setSelectedMetric('sharesMined')}
          >
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Pickaxe className="w-3 h-3" />
                  Shares Mined
                </div>
                <div className="text-xl sm:text-2xl font-mono font-bold">
                  {formatNumber(mh?.sharesMined || 0)}
                </div>
                <div className="text-xs text-muted-foreground">
                  +{formatNumber(mh?.periodSharesMined || 0)} this period
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Shares Burned */}
          <Card 
            data-testid="card-shares-burned"
            className={`cursor-pointer transition-all ${selectedMetric === 'sharesBurned' ? 'ring-2 ring-primary' : 'hover-elevate'}`}
            onClick={() => setSelectedMetric('sharesBurned')}
          >
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Flame className="w-3 h-3" />
                  Shares Burned
                </div>
                <div className="text-xl sm:text-2xl font-mono font-bold">
                  {formatNumber(mh?.sharesBurned || 0)}
                </div>
                <div className="text-xs text-muted-foreground">
                  +{formatNumber(mh?.periodSharesBurned || 0)} this period
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Shares */}
          <Card 
            data-testid="card-total-shares"
            className={`cursor-pointer transition-all ${selectedMetric === 'totalShares' ? 'ring-2 ring-primary' : 'hover-elevate'}`}
            onClick={() => setSelectedMetric('totalShares')}
          >
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Coins className="w-3 h-3" />
                  Total Shares
                </div>
                <div className="text-xl sm:text-2xl font-mono font-bold">
                  {formatNumber(mh?.totalShares || 0)}
                </div>
                <div className="text-xs text-muted-foreground">
                  in economy
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Dynamic Metric Chart - Based on Selected Metric */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {selectedMetric === 'marketCap' && <><BarChart3 className="w-4 h-4" /> Market Cap Over Time</>}
              {selectedMetric === 'transactions' && <><Activity className="w-4 h-4" /> Transactions Over Time</>}
              {selectedMetric === 'volume' && <><DollarSign className="w-4 h-4" /> Volume Over Time</>}
              {selectedMetric === 'sharesMined' && <><Pickaxe className="w-4 h-4" /> Shares Mined Over Time</>}
              {selectedMetric === 'sharesBurned' && <><Flame className="w-4 h-4" /> Shares Burned Over Time</>}
              {selectedMetric === 'totalShares' && <><Coins className="w-4 h-4" /> Total Shares Over Time</>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snapshotsData?.snapshots && snapshotsData.snapshots.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={snapshotsData.snapshots}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={10}
                    tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={10}
                    tickFormatter={(v) => {
                      if (selectedMetric === 'marketCap' || selectedMetric === 'volume') {
                        if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                        if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                        return `$${v}`;
                      }
                      if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
                      return v.toString();
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                    labelFormatter={(v) => new Date(v).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    formatter={(value: number) => {
                      if (selectedMetric === 'marketCap' || selectedMetric === 'volume') {
                        return [`$${value.toLocaleString()}`, selectedMetric === 'marketCap' ? 'Market Cap' : 'Volume'];
                      }
                      return [value.toLocaleString(), 
                        selectedMetric === 'transactions' ? 'Transactions' :
                        selectedMetric === 'sharesMined' ? 'Shares Mined' :
                        selectedMetric === 'sharesBurned' ? 'Shares Burned' : 'Total Shares'
                      ];
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey={selectedMetric}
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, fill: 'hsl(var(--primary))' }}
                    isAnimationActive={true}
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                {snapshotsData ? 'No snapshot data available for selected time range' : 'Loading market data...'}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs - Simplified to Overview, Rankings, Compare, Positions */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="w-full grid grid-cols-4 h-auto">
            <TabsTrigger value="overview" className="text-xs sm:text-sm py-2" data-testid="tab-overview">
              <BarChart3 className="w-4 h-4 mr-1 hidden sm:inline" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="rankings" className="text-xs sm:text-sm py-2" data-testid="tab-rankings">
              <Target className="w-4 h-4 mr-1 hidden sm:inline" />
              Rankings
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

          {/* Overview Tab - All-Encompassing Chart */}
          <TabsContent value="overview" className="space-y-4">
            {/* Share Economy Chart - Shows vesting and burning activity */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Coins className="w-4 h-4" />
                  Share Economy Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                {mh?.shareEconomyTimeSeries && mh.shareEconomyTimeSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <ComposedChart data={mh.shareEconomyTimeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="date" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={10}
                        tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={10}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '12px'
                        }}
                        labelFormatter={(v) => new Date(v).toLocaleDateString()}
                        formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                      />
                      <Legend />
                      <Bar 
                        dataKey="sharesMined" 
                        fill="hsl(142 76% 36%)" 
                        name="Shares Vested"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={true}
                        animationDuration={800}
                        animationEasing="ease-out"
                      />
                      <Bar 
                        dataKey="sharesBurned" 
                        fill="hsl(0 72% 51%)" 
                        name="Shares Burned"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={true}
                        animationDuration={800}
                        animationEasing="ease-out"
                        animationBegin={200}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                    No vesting or contest activity in selected time period
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Trading Activity Chart */}
            {mh?.timeSeries && mh.timeSeries.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Trading Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={mh.timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="date" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={10}
                        tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis 
                        yAxisId="left"
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={10}
                        tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(0) + 'K' : v}`}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={10}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '12px'
                        }}
                        labelFormatter={(v) => new Date(v).toLocaleDateString()}
                        formatter={(value: number, name: string) => {
                          if (name === 'Volume') return [`$${value.toLocaleString()}`, name];
                          return [value.toLocaleString(), name];
                        }}
                      />
                      <Legend />
                      <Bar 
                        yAxisId="left"
                        dataKey="volume" 
                        fill="hsl(var(--primary) / 0.3)" 
                        name="Volume"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={true}
                        animationDuration={800}
                        animationEasing="ease-out"
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="transactions" 
                        stroke="hsl(var(--chart-2))" 
                        strokeWidth={2}
                        dot={false}
                        name="Transactions"
                        isAnimationActive={true}
                        animationDuration={1200}
                        animationEasing="ease-out"
                        animationBegin={300}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Quick Stats Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Economy Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Net Share Flow</span>
                    <span className={`font-mono font-bold ${(mh?.sharesMined || 0) - (mh?.sharesBurned || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {(mh?.sharesMined || 0) - (mh?.sharesBurned || 0) >= 0 ? '+' : ''}
                      {formatNumber((mh?.sharesMined || 0) - (mh?.sharesBurned || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Avg Trade Size</span>
                    <span className="font-mono">
                      {mh?.transactions ? formatLargeNumber((mh?.volume || 0) / mh.transactions) : '$0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Most Active Team</span>
                    <Badge variant="outline">{analyticsData?.marketStats?.mostActiveTeam || 'N/A'}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Top 5 Players</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analyticsData?.powerRankings?.slice(0, 5).map((ranking, idx) => (
                      <Link key={ranking.player.id} href={`/player/${ranking.player.id}`}>
                        <div className="flex items-center justify-between text-sm hover-elevate p-1 rounded">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground w-4">{ranking.rank}</span>
                            <span className="font-medium">{ranking.player.firstName} {ranking.player.lastName}</span>
                          </div>
                          <span className={`font-mono text-xs ${getPriceChangeColor(ranking.priceChange7d)}`}>
                            {ranking.priceChange7d >= 0 ? '+' : ''}{ranking.priceChange7d.toFixed(1)}%
                          </span>
                        </div>
                      </Link>
                    )) || <div className="text-sm text-muted-foreground text-center py-4">No data</div>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Rankings Tab */}
          <TabsContent value="rankings" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Power Rankings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Rank</th>
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Player</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Price</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Volume</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Avg FP</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsData?.powerRankings?.map((ranking) => (
                        <tr key={ranking.player.id} className="border-b last:border-0 hover-elevate">
                          <td className="py-2 px-2 font-mono font-bold">{ranking.rank}</td>
                          <td className="py-2 px-2">
                            <Link href={`/player/${ranking.player.id}`}>
                              <div className="font-medium hover:underline">
                                {ranking.player.firstName} {ranking.player.lastName}
                              </div>
                              <div className="text-xs text-muted-foreground">{ranking.player.team} - {ranking.player.position}</div>
                            </Link>
                          </td>
                          <td className="py-2 px-2 text-right font-mono">${ranking.player.lastTradePrice}</td>
                          <td className="py-2 px-2 text-right font-mono">{ranking.player.volume24h}</td>
                          <td className="py-2 px-2 text-right font-mono">{ranking.avgFantasyPoints.toFixed(1)}</td>
                          <td className={`py-2 px-2 text-right font-mono ${getPriceChangeColor(ranking.priceChange7d)}`}>
                            {ranking.priceChange7d >= 0 ? '+' : ''}{ranking.priceChange7d.toFixed(1)}%
                          </td>
                        </tr>
                      )) || (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-muted-foreground">No rankings available</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Compare Tab */}
          <TabsContent value="compare" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <GitCompare className="w-4 h-4" />
                  Compare Players (Select up to 5)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Select onValueChange={(v) => handlePlayerSelect(v)}>
                    <SelectTrigger className="w-48" data-testid="select-player-compare">
                      <SelectValue placeholder="Add player..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allPlayers?.filter(p => p.isActive && !selectedPlayers.includes(p.id))
                        .slice(0, 50)
                        .map(player => (
                          <SelectItem key={player.id} value={player.id}>
                            {player.firstName} {player.lastName}
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                  {selectedPlayers.map(id => {
                    const player = allPlayers?.find(p => p.id === id);
                    return player ? (
                      <Badge 
                        key={id} 
                        variant="secondary" 
                        className="cursor-pointer"
                        onClick={() => handlePlayerSelect(id)}
                      >
                        {player.firstName} {player.lastName} ×
                      </Badge>
                    ) : null;
                  })}
                </div>

                {comparisonLoading && selectedPlayers.length > 0 && (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                )}

                {comparisonData?.players && comparisonData.players.length > 0 && (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2 font-medium text-muted-foreground">Player</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Shares</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Market Cap</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Price</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Volume</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Contest %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonData.players.map((player, idx) => (
                            <tr key={player.id} className="border-b last:border-0">
                              <td className="py-2 px-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: chartColors[idx] }}></div>
                                  <div>
                                    <div className="font-medium">{player.name}</div>
                                    <div className="text-xs text-muted-foreground">{player.team} - {player.position}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right font-mono">{player.shares.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right font-mono">{formatLargeNumber(player.marketCap)}</td>
                              <td className="py-2 px-2 text-right font-mono">${player.price.toFixed(2)}</td>
                              <td className="py-2 px-2 text-right font-mono">{player.volume}</td>
                              <td className="py-2 px-2 text-right font-mono">{player.contestUsagePercent.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {comparisonData.players.some(p => p.priceHistory.length > 0) && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium mb-2">Price History</h4>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis 
                              dataKey="timestamp" 
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
                            />
                            <Legend />
                            {comparisonData.players.map((player, idx) => (
                              player.priceHistory.length > 0 && (
                                <Line 
                                  key={player.id}
                                  type="monotone"
                                  data={player.priceHistory}
                                  dataKey="price"
                                  stroke={chartColors[idx]}
                                  name={player.name}
                                  strokeWidth={2}
                                  dot={false}
                                  isAnimationActive={true}
                                  animationDuration={1200}
                                  animationEasing="ease-out"
                                  animationBegin={idx * 150}
                                />
                              )
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}

                {(!comparisonData?.players || comparisonData.players.length === 0) && selectedPlayers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Select players to compare their stats
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Positions Tab */}
          <TabsContent value="positions" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {analyticsData?.positionRankings?.map((posRanking) => (
                <Card key={posRanking.position}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Badge variant="outline">{posRanking.position}</Badge>
                      Top Players
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {posRanking.players.slice(0, 5).map((ranking) => (
                        <Link key={ranking.player.id} href={`/player/${ranking.player.id}`}>
                          <div className="flex items-center justify-between text-sm hover-elevate p-1 rounded">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-muted-foreground w-4">{ranking.rank}</span>
                              <span className="font-medium truncate max-w-[120px]">
                                {ranking.player.firstName} {ranking.player.lastName}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-xs">{ranking.avgFantasyPoints.toFixed(1)} FP</div>
                              <div className={`font-mono text-xs ${getPriceChangeColor(ranking.priceChange7d)}`}>
                                {ranking.priceChange7d >= 0 ? '+' : ''}{ranking.priceChange7d.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        </Link>
                      )) || <div className="text-sm text-muted-foreground text-center py-4">No players</div>}
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
