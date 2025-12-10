import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useWebSocket } from "@/lib/websocket";
import { useNotifications } from "@/lib/notification-context";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, Crown, Clock, ShoppingCart, Trophy, ArrowUpRight, ArrowDownRight, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { invalidatePortfolioQueries } from "@/lib/cache-invalidation";
import type { Holding, Order, Player } from "@shared/schema";
import { PlayerName } from "@/components/player-name";
import { Shimmer, ShimmerCard } from "@/components/ui/animations";
import { AnimatedPrice } from "@/components/ui/animated-price";
import { EmptyState } from "@/components/ui/empty-state";

interface PortfolioData {
  balance: string;
  portfolioValue: string;
  totalPnL: string;
  totalPnLPercent: string;
  holdings: (Holding & { 
    player?: Player; 
    currentValue: string; 
    pnl: string; 
    pnlPercent: string;
    bestBid?: string | null;
    bestAsk?: string | null;
    bidSize?: number;
    askSize?: number;
  })[];
  openOrders: (Order & { player: Player })[];
  premiumShares: number;
  isPremium: boolean;
  premiumExpiresAt?: string;
}

interface UserActivity {
  id: string;
  timestamp: string;
  category: 'vesting' | 'market' | 'contest';
  type: string;
  description: string;
  cashDelta?: string;
  shareDelta?: number;
  balanceAfter?: string;
  metadata: {
    playerName?: string;
    playerId?: number;
    contestId?: string;
    contestName?: string;
    tradePrice?: string;
    orderType?: string;
    side?: string;
    quantity?: number;
    shares?: number;
    entryFee?: string;
    payout?: string;
    rank?: number;
    totalEntries?: number;
  };
}

interface ActivityResponse {
  activities: UserActivity[];
  total: number;
  limit: number;
  offset: number;
}

type SortField = 'name' | 'quantity' | 'avgCost' | 'price' | 'bid' | 'ask' | 'value' | 'pnl';
type SortDirection = 'asc' | 'desc';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'quantity', label: 'Quantity' },
  { value: 'avgCost', label: 'Avg Cost' },
  { value: 'price', label: 'Price' },
  { value: 'bid', label: 'Bid' },
  { value: 'ask', label: 'Ask' },
  { value: 'value', label: 'Value' },
  { value: 'pnl', label: 'P&L' },
];

export default function Portfolio() {
  const { toast } = useToast();
  const { subscribe } = useWebSocket();
  const { unreadCount, clearUnread } = useNotifications();
  const [activeTab, setActiveTab] = useState("holdings");
  const [chartTimeRange, setChartTimeRange] = useState("1M");
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data, isLoading } = useQuery<PortfolioData>({
    queryKey: ["/api/portfolio"],
  });

  const { data: chartData } = useQuery<{ history: Array<{ date: string; cashBalance: number; portfolioValue: number; netWorth: number }>; timeRange: string }>({
    queryKey: ["/api/user/portfolio-history", chartTimeRange],
    queryFn: async () => {
      const res = await fetch(`/api/user/portfolio-history?timeRange=${chartTimeRange}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch portfolio history');
      return res.json();
    },
  });

  // Clear notifications when viewing Activity tab
  useEffect(() => {
    if (activeTab === "activity") {
      clearUnread();
    }
  }, [activeTab, clearUnread]);

  // WebSocket listener for real-time portfolio updates
  useEffect(() => {
    // Portfolio events will auto-invalidate via WebSocket provider
    // But we can also subscribe for custom logic if needed
    const unsubPortfolio = subscribe('portfolio', () => {
      // Additional portfolio-specific logic could go here
    });

    const unsubTrade = subscribe('trade', () => {
      // Trades affect holdings and orders
    });

    const unsubOrderBook = subscribe('orderBook', () => {
      // Order book changes might affect pending orders
    });

    return () => {
      unsubPortfolio();
      unsubTrade();
      unsubOrderBook();
    };
  }, [subscribe]);

  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await apiRequest("POST", `/api/orders/${orderId}/cancel`, {});
    },
    onSuccess: async () => {
      await invalidatePortfolioQueries();
      toast({ title: "Order cancelled" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to cancel order", description: error.message, variant: "destructive" });
    },
  });

  const redeemPremiumMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/premium/redeem", {});
    },
    onSuccess: async () => {
      await invalidatePortfolioQueries();
      toast({ title: "Premium activated!", description: "You now have premium access for 30 days" });
    },
    onError: (error: Error) => {
      toast({ title: "Redemption failed", description: error.message, variant: "destructive" });
    },
  });

  // Toggle sort direction or change sort field
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      // Name sorts A-Z (asc) by default, numeric fields sort high-to-low (desc)
      setSortDirection(field === 'name' ? 'asc' : 'desc');
    }
  };

  // Parse currency string to number (strips $, commas, etc.)
  const parseCurrency = (value: string | null | undefined): number => {
    if (!value) return 0;
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // Get sort value for a holding
  const getSortValue = (holding: PortfolioData['holdings'][0], field: SortField): number | string => {
    switch (field) {
      case 'name':
        return `${holding.player?.lastName || ''} ${holding.player?.firstName || ''}`.toLowerCase();
      case 'quantity':
        return holding.quantity;
      case 'avgCost':
        return parseCurrency(holding.avgCostBasis);
      case 'price':
        return parseCurrency(holding.player?.lastTradePrice);
      case 'bid':
        return parseCurrency(holding.bestBid);
      case 'ask':
        return parseCurrency(holding.bestAsk);
      case 'value':
        return parseCurrency(holding.currentValue);
      case 'pnl':
        return parseCurrency(holding.pnl);
      default:
        return 0;
    }
  };

  // Sort player holdings
  const sortedHoldings = (data?.holdings.filter(h => h.assetType === "player") || []).slice().sort((a, b) => {
    const aVal = getSortValue(a, sortField);
    const bVal = getSortValue(b, sortField);
    
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    
    const aNum = typeof aVal === 'number' ? aVal : 0;
    const bNum = typeof bVal === 'number' ? bVal : 0;
    return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
  });

  // Render sort icon for column header
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    }
    return sortDirection === 'asc' 
      ? <ChevronUp className="w-3 h-3 ml-1" />
      : <ChevronDown className="w-3 h-3 ml-1" />;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-3 sm:p-4">
        <div className="max-w-7xl mx-auto">
          <Shimmer height="36px" width="150px" className="mb-6 hidden sm:block" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <ShimmerCard lines={2} />
            <ShimmerCard lines={2} />
            <ShimmerCard lines={2} />
          </div>
          <ShimmerCard lines={6} className="mb-4" />
          <ShimmerCard lines={8} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-4">
          <h1 className="hidden sm:block text-3xl font-bold mb-4 sm:mb-6">Portfolio</h1>
          
          {/* Portfolio Summary - Mobile: Single row, Desktop: 3 cards */}
          <div className="mb-4 sm:mb-4">
            {/* Mobile Layout - All stats in one row */}
            <Card className="md:hidden">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="text-muted-foreground uppercase tracking-wide mb-0.5">Cash</div>
                    <div className="font-mono font-bold" data-testid="text-cash-balance">${data?.balance}</div>
                  </div>
                  <div className="flex-1 min-w-0 text-center">
                    <div className="text-muted-foreground uppercase tracking-wide mb-0.5">Portfolio</div>
                    <div className="font-mono font-bold" data-testid="text-portfolio-value">${data?.portfolioValue}</div>
                  </div>
                  <div className="flex-1 min-w-0 text-center">
                    <div className="text-muted-foreground uppercase tracking-wide mb-0.5">P&L</div>
                    <div className={`font-mono font-bold ${parseFloat(data?.totalPnL || "0") >= 0 ? 'text-positive' : 'text-negative'}`} data-testid="text-total-pnl">
                      {parseFloat(data?.totalPnL || "0") >= 0 ? '+' : ''}${data?.totalPnL}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="flex items-center justify-end gap-1 text-muted-foreground uppercase tracking-wide mb-0.5">
                      <Crown className="w-3 h-3 text-yellow-500" />
                      <span>Premium</span>
                    </div>
                    <div className="font-mono font-bold text-yellow-500" data-testid="text-premium-shares">
                      {data?.premiumShares || 0}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Desktop Layout - 4 separate cards */}
            <div className="hidden md:grid md:grid-cols-4 gap-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium uppercase tracking-wide">Cash Balance</CardTitle>
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-mono font-bold" data-testid="text-cash-balance-desktop">${data?.balance}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium uppercase tracking-wide">Portfolio Value</CardTitle>
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-mono font-bold" data-testid="text-portfolio-value-desktop">${data?.portfolioValue}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium uppercase tracking-wide">Total P&L</CardTitle>
                  {parseFloat(data?.totalPnL || "0") >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-positive" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-negative" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className={`text-3xl font-mono font-bold ${parseFloat(data?.totalPnL || "0") >= 0 ? 'text-positive' : 'text-negative'}`} data-testid="text-total-pnl-desktop">
                    {parseFloat(data?.totalPnL || "0") >= 0 ? '+' : ''}${data?.totalPnL}
                  </div>
                  <div className={`text-sm ${parseFloat(data?.totalPnL || "0") >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {parseFloat(data?.totalPnL || "0") >= 0 ? '+' : ''}{data?.totalPnLPercent}%
                  </div>
                </CardContent>
              </Card>

              <Card className={data?.isPremium ? "border-yellow-500/50 bg-gradient-to-br from-yellow-500/5 to-amber-500/5" : ""}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium uppercase tracking-wide">Premium Shares</CardTitle>
                  <Crown className="w-4 h-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-mono font-bold text-yellow-500" data-testid="text-premium-shares-desktop">
                    {data?.premiumShares || 0}
                  </div>
                  {data?.isPremium && data?.premiumExpiresAt && (
                    <div className="text-sm text-muted-foreground">
                      Expires {formatDistanceToNow(new Date(data.premiumExpiresAt), { addSuffix: true })}
                    </div>
                  )}
                  {(!data?.isPremium && (data?.premiumShares || 0) > 0) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 text-xs border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/10"
                      onClick={() => redeemPremiumMutation.mutate()}
                      disabled={redeemPremiumMutation.isPending}
                      data-testid="button-redeem-premium-desktop"
                    >
                      {redeemPremiumMutation.isPending ? "Redeeming..." : "Redeem for 30 days"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Portfolio Value Chart */}
        <Card className="mb-4 sm:mb-4">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wide">Portfolio Value</CardTitle>
            <div className="flex gap-1">
              {["1D", "7D", "1M", "1Y", "ALL"].map((range) => (
                <Button
                  key={range}
                  variant={chartTimeRange === range ? "default" : "outline"}
                  size="sm"
                  onClick={() => setChartTimeRange(range)}
                  className="h-7 px-2 text-xs"
                  data-testid={`button-chart-${range.toLowerCase()}`}
                >
                  {range}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {chartData && chartData.history.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData.history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                    formatter={(value: any) => [`$${parseFloat(value).toFixed(2)}`, 'Portfolio Value']}
                    labelFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString();
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="portfolioValue" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={true}
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground" data-testid="text-no-chart-data">
                No historical data available yet. Portfolio snapshots are created daily.
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3 sm:space-y-3">
          <TabsList>
            <TabsTrigger value="holdings" data-testid="tab-holdings">Holdings</TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-open-orders">Open Orders</TabsTrigger>
            <TabsTrigger 
              value="activity" 
              data-testid="tab-activity"
              className={unreadCount > 0 ? "relative ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}
            >
              <span className="flex items-center gap-1.5">
                Activity
                <AnimatePresence>
                  {unreadCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                    >
                      <Badge 
                        variant="default" 
                        className="min-w-5 h-5 flex items-center justify-center px-1.5 text-xs font-bold"
                        data-testid="badge-activity-count"
                      >
                        {unreadCount}
                      </Badge>
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </TabsTrigger>
          </TabsList>

          {/* Holdings */}
          <TabsContent value="holdings">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wide">Your Holdings</CardTitle>
                {/* Mobile sort dropdown */}
                <div className="sm:hidden flex items-center gap-2">
                  <Select value={sortField} onValueChange={(val) => setSortField(val as SortField)}>
                    <SelectTrigger className="h-8 text-xs w-[100px]" data-testid="select-mobile-sort-field">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                    data-testid="button-mobile-sort-direction"
                  >
                    {sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {!data?.premiumShares && sortedHoldings.length === 0 ? (
                  <EmptyState
                    icon="wallet"
                    title="Your portfolio is empty"
                    description="Start trading to build your portfolio. Browse the marketplace to find players to invest in."
                    action={{ label: "Browse Marketplace", onClick: () => window.location.href = "/marketplace" }}
                    size="sm"
                    className="py-8"
                    data-testid="empty-holdings"
                  />
                ) : (
                  <div>
                    <table className="w-full">
                      <thead className="border-b bg-muted/50 hidden sm:table-header-group">
                        <tr>
                          <th 
                            className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none"
                            onClick={() => handleSort('name')}
                            data-testid="th-sort-name"
                          >
                            <span className="flex items-center">Asset<SortIcon field="name" /></span>
                          </th>
                          <th 
                            className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none"
                            onClick={() => handleSort('quantity')}
                            data-testid="th-sort-quantity"
                          >
                            <span className="flex items-center justify-end">Qty<SortIcon field="quantity" /></span>
                          </th>
                          <th 
                            className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none"
                            onClick={() => handleSort('avgCost')}
                            data-testid="th-sort-avgcost"
                          >
                            <span className="flex items-center justify-end">Avg<SortIcon field="avgCost" /></span>
                          </th>
                          <th 
                            className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell cursor-pointer hover:text-foreground select-none"
                            onClick={() => handleSort('price')}
                            data-testid="th-sort-price"
                          >
                            <span className="flex items-center justify-end">Price<SortIcon field="price" /></span>
                          </th>
                          <th 
                            className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell cursor-pointer hover:text-foreground select-none"
                            onClick={() => handleSort('bid')}
                            data-testid="th-sort-bid"
                          >
                            <span className="flex items-center justify-end">Bid<SortIcon field="bid" /></span>
                          </th>
                          <th 
                            className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell cursor-pointer hover:text-foreground select-none"
                            onClick={() => handleSort('ask')}
                            data-testid="th-sort-ask"
                          >
                            <span className="flex items-center justify-end">Ask<SortIcon field="ask" /></span>
                          </th>
                          <th 
                            className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden xl:table-cell cursor-pointer hover:text-foreground select-none"
                            onClick={() => handleSort('value')}
                            data-testid="th-sort-value"
                          >
                            <span className="flex items-center justify-end">Value<SortIcon field="value" /></span>
                          </th>
                          <th 
                            className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none"
                            onClick={() => handleSort('pnl')}
                            data-testid="th-sort-pnl"
                          >
                            <span className="flex items-center justify-end">P&L<SortIcon field="pnl" /></span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                      {(data?.premiumShares ?? 0) > 0 && (
                        <tr className="border-b hover-elevate" data-testid="row-premium-shares">
                          {/* Mobile layout */}
                          <td className="px-2 py-2 sm:hidden" colSpan={8}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <Crown className="w-8 h-8 text-primary flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-sm">Premium Share</div>
                                  <div className="text-xs text-muted-foreground">Qty: {data.premiumShares} • Redeemable for 30 days</div>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => redeemPremiumMutation.mutate()}
                                disabled={redeemPremiumMutation.isPending || data.isPremium}
                                data-testid="button-redeem-premium"
                              >
                                {data.isPremium ? "Active" : "Redeem"}
                              </Button>
                            </div>
                          </td>

                          {/* Desktop layout */}
                          <td className="px-2 py-1.5 hidden sm:table-cell">
                            <div className="flex items-center gap-2">
                              <Crown className="w-8 h-8 text-primary" />
                              <div>
                                <div className="font-medium text-sm">Premium Share</div>
                                <div className="text-xs text-muted-foreground">Redeemable for 30 days access</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono hidden sm:table-cell">{data.premiumShares}</td>
                          <td className="px-2 py-1.5 text-right font-mono hidden sm:table-cell">-</td>
                          <td className="px-2 py-1.5 text-right font-mono hidden md:table-cell">-</td>
                          <td className="px-2 py-1.5 text-right font-mono hidden sm:table-cell">-</td>
                          <td className="px-2 py-1.5 text-right font-mono hidden sm:table-cell">-</td>
                          <td className="px-2 py-1.5 text-right font-mono hidden xl:table-cell">-</td>
                          <td className="px-2 py-1.5 text-right hidden sm:table-cell">
                            <Button
                              size="sm"
                              onClick={() => redeemPremiumMutation.mutate()}
                              disabled={redeemPremiumMutation.isPending || data.isPremium}
                              data-testid="button-redeem-premium-desktop"
                            >
                              {data.isPremium ? "Active" : "Redeem"}
                            </Button>
                          </td>
                        </tr>
                      )}
                      {sortedHoldings.map((holding) => (
                        <tr key={holding.id} className="border-b last:border-0 hover-elevate" data-testid={`row-holding-${holding.player?.id}`}>
                          {/* Mobile layout - stacked info matching marketplace */}
                          <td className="px-2 py-2 sm:hidden" colSpan={8}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <span className="font-bold text-xs">{holding.player?.firstName[0]}{holding.player?.lastName[0]}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-sm">
                                    {holding.player && (
                                      <PlayerName 
                                        playerId={holding.player.id} 
                                        firstName={holding.player.firstName} 
                                        lastName={holding.player.lastName}
                                        className="text-sm"
                                      />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                                    <span>{holding.player?.team}</span>
                                    <span>•</span>
                                    <span>{holding.player?.position}</span>
                                    <span>•</span>
                                    <span className="font-mono">Qty: {holding.quantity}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs mt-0.5">
                                    <span className="text-muted-foreground">Avg: ${holding.avgCostBasis}</span>
                                    <span className="text-muted-foreground">•</span>
                                    {holding.player?.lastTradePrice ? (
                                      <AnimatedPrice 
                                        value={parseFloat(holding.player.lastTradePrice)} 
                                        size="sm" 
                                        className="font-mono font-bold"
                                      />
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                    {holding.pnl !== null && (
                                      <>
                                        <span className="text-muted-foreground">•</span>
                                        <span className={parseFloat(holding.pnl) >= 0 ? 'text-positive' : 'text-negative'}>
                                          {parseFloat(holding.pnl) >= 0 ? '+' : ''}${holding.pnl} ({parseFloat(holding.pnlPercent) >= 0 ? '+' : ''}{holding.pnlPercent}%)
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  {/* Mobile bid/ask row */}
                                  <div className="flex items-center gap-2 text-xs mt-1">
                                    {holding.bestBid && (
                                      <Link href={`/player/${holding.player?.id}?action=sell&price=${holding.bestBid}`}>
                                        <span className="text-positive hover:underline cursor-pointer font-mono" data-testid={`link-bid-mobile-${holding.player?.id}`}>
                                          Bid: ${holding.bestBid}
                                        </span>
                                      </Link>
                                    )}
                                    {holding.bestBid && holding.bestAsk && <span className="text-muted-foreground">|</span>}
                                    {holding.bestAsk && (
                                      <Link href={`/player/${holding.player?.id}?action=buy&price=${holding.bestAsk}`}>
                                        <span className="text-negative hover:underline cursor-pointer font-mono" data-testid={`link-ask-mobile-${holding.player?.id}`}>
                                          Ask: ${holding.bestAsk}
                                        </span>
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Desktop layout - table cells */}
                          <td className="px-2 py-1.5 hidden sm:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <span className="font-bold text-xs">{holding.player?.firstName[0]}{holding.player?.lastName[0]}</span>
                              </div>
                              <div>
                                <div className="font-medium text-sm">
                                  {holding.player && (
                                    <PlayerName 
                                      playerId={holding.player.id} 
                                      firstName={holding.player.firstName} 
                                      lastName={holding.player.lastName}
                                      className="text-sm"
                                    />
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground md:hidden">{holding.player?.team} • {holding.player?.position}</div>
                                <div className="text-xs text-muted-foreground hidden md:inline">{holding.player?.team} • {holding.player?.position}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-sm hidden sm:table-cell">{holding.quantity}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-sm hidden sm:table-cell">${holding.avgCostBasis}</td>
                          <td className="px-2 py-1.5 text-right hidden md:table-cell">
                            {holding.player?.lastTradePrice ? (
                              <AnimatedPrice 
                                value={parseFloat(holding.player.lastTradePrice)} 
                                size="sm" 
                                className="font-mono font-bold justify-end"
                              />
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                          {/* Bid - clicking sells at this price */}
                          <td className="px-2 py-1.5 text-right hidden sm:table-cell">
                            {holding.bestBid ? (
                              <Link href={`/player/${holding.player?.id}?action=sell&price=${holding.bestBid}`}>
                                <span 
                                  className="font-mono text-sm text-positive hover:underline cursor-pointer"
                                  data-testid={`link-bid-${holding.player?.id}`}
                                  title={`Sell at $${holding.bestBid} (${holding.bidSize} shares)`}
                                >
                                  ${holding.bestBid}
                                </span>
                              </Link>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                          {/* Ask - clicking buys at this price */}
                          <td className="px-2 py-1.5 text-right hidden sm:table-cell">
                            {holding.bestAsk ? (
                              <Link href={`/player/${holding.player?.id}?action=buy&price=${holding.bestAsk}`}>
                                <span 
                                  className="font-mono text-sm text-negative hover:underline cursor-pointer"
                                  data-testid={`link-ask-${holding.player?.id}`}
                                  title={`Buy at $${holding.bestAsk} (${holding.askSize} shares)`}
                                >
                                  ${holding.bestAsk}
                                </span>
                              </Link>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-sm hidden xl:table-cell">
                            {holding.currentValue !== null ? `$${holding.currentValue}` : <span className="text-muted-foreground text-xs">-</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right hidden sm:table-cell">
                            {holding.pnl !== null ? (
                              <div className={parseFloat(holding.pnl) >= 0 ? 'text-positive' : 'text-negative'}>
                                <div className="font-mono font-medium text-sm">
                                  {parseFloat(holding.pnl) >= 0 ? '+' : ''}${holding.pnl}
                                </div>
                                <div className="text-xs">
                                  ({parseFloat(holding.pnlPercent) >= 0 ? '+' : ''}{holding.pnlPercent}%)
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Open Orders */}
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-wide">Open Orders</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data?.openOrders.length === 0 ? (
                  <EmptyState
                    icon="cart"
                    title="No open orders"
                    description="Place limit orders to buy or sell players at your target price."
                    size="sm"
                    className="py-8"
                    data-testid="empty-orders"
                  />
                ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="border-b bg-muted/50">
                          <tr>
                            <th className="text-left p-2 sm:p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                            <th className="text-left p-2 sm:p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</th>
                            <th className="text-right p-2 sm:p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Side</th>
                            <th className="text-right p-2 sm:p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantity</th>
                            <th className="text-right p-2 sm:p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price</th>
                            <th className="text-right p-2 sm:p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filled</th>
                            <th className="p-2 sm:p-4"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {data?.openOrders.map((order) => (
                            <tr key={order.id} className="border-b hover-elevate" data-testid={`row-order-${order.id}`}>
                              <td className="p-2 sm:p-4">
                                <Badge variant="outline" className="capitalize">{order.orderType}</Badge>
                              </td>
                              <td className="p-2 sm:p-4">
                                <div className="font-medium">
                                  <PlayerName 
                                    playerId={order.player.id} 
                                    firstName={order.player.firstName} 
                                    lastName={order.player.lastName}
                                  />
                                </div>
                                <div className="text-xs text-muted-foreground">{order.player.team}</div>
                              </td>
                              <td className="p-2 sm:p-4 text-right">
                                <Badge className={order.side === "buy" ? "bg-positive" : "bg-negative"}>
                                  {order.side.toUpperCase()}
                                </Badge>
                              </td>
                              <td className="p-2 sm:p-4 text-right font-mono">{order.quantity}</td>
                              <td className="p-2 sm:p-4 text-right font-mono">
                                {order.limitPrice ? `$${order.limitPrice}` : "Market"}
                              </td>
                              <td className="p-2 sm:p-4 text-right font-mono">{order.filledQuantity}</td>
                              <td className="p-2 sm:p-4">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => cancelOrderMutation.mutate(order.id)}
                                  disabled={cancelOrderMutation.isPending}
                                  data-testid={`button-cancel-${order.id}`}
                                >
                                  Cancel
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Feed */}
          <TabsContent value="activity">
            <ActivityFeed />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ActivityFeed() {
  const { data: activityData, isLoading } = useQuery<ActivityResponse>({
    queryKey: ['/api/activity'],
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          {[85, 75, 90, 70, 80].map((width, i) => (
            <div key={i} className="flex items-center gap-3">
              <Shimmer width="40px" height="40px" className="rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Shimmer height="14px" width={`${width}%`} />
                <Shimmer height="12px" width="120px" />
              </div>
              <Shimmer height="16px" width="60px" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!activityData || activityData.activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wide">Activity History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <EmptyState
            icon="inbox"
            title="No activity yet"
            description="Start trading, vesting, or entering contests to see your activity here."
            size="sm"
            className="py-8"
            data-testid="empty-activity"
          />
        </CardContent>
      </Card>
    );
  }

  const getActivityIcon = (category: string, type: string) => {
    if (category === 'vesting') return <Clock className="w-4 h-4" />;
    if (category === 'market') return <ShoppingCart className="w-4 h-4" />;
    if (category === 'contest') return <Trophy className="w-4 h-4" />;
    return null;
  };

  const getCategoryColor = (category: string) => {
    if (category === 'vesting') return 'text-yellow-500';
    if (category === 'market') return 'text-blue-500';
    if (category === 'contest') return 'text-purple-500';
    return 'text-muted-foreground';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium uppercase tracking-wide">Activity History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {activityData.activities.map((activity) => {
            const cashDelta = activity.cashDelta ? parseFloat(activity.cashDelta) : null;
            const isPositive = cashDelta && cashDelta > 0;
            const isNegative = cashDelta && cashDelta < 0;

            return (
              <div
                key={activity.id}
                className="p-3 sm:p-4 hover-elevate flex items-start gap-3"
                data-testid={`activity-${activity.id}`}
              >
                {/* Icon */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center ${getCategoryColor(activity.category)}`}>
                  {getActivityIcon(activity.category, activity.type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Description with player link */}
                  <div className="text-sm font-medium mb-1">
                    {activity.metadata.playerId ? (
                      <Link href={`/player/${activity.metadata.playerId}`} className="hover:underline">
                        {activity.description}
                      </Link>
                    ) : activity.metadata.contestId ? (
                      <Link href={`/contest/${activity.metadata.contestId}`} className="hover:underline">
                        {activity.description}
                      </Link>
                    ) : (
                      activity.description
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <span className="capitalize">{activity.category}</span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}</span>
                    
                    {/* Show shares for mining */}
                    {activity.shareDelta && activity.shareDelta > 0 && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-green-500">
                          +{activity.shareDelta} {activity.shareDelta === 1 ? 'share' : 'shares'}
                        </span>
                      </>
                    )}

                    {/* Show order details for market */}
                    {activity.metadata.orderType && (
                      <>
                        <span>•</span>
                        <span className="capitalize">{activity.metadata.orderType}</span>
                      </>
                    )}

                    {/* Show trade price for market */}
                    {activity.metadata.tradePrice && (
                      <>
                        <span>•</span>
                        <span className="font-mono">${activity.metadata.tradePrice}</span>
                      </>
                    )}

                    {/* Show rank for contest payouts */}
                    {activity.metadata.rank && activity.metadata.totalEntries && (
                      <>
                        <span>•</span>
                        <span>
                          Rank {activity.metadata.rank} of {activity.metadata.totalEntries}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Cash Delta */}
                {cashDelta !== null && cashDelta !== 0 && (
                  <div className="flex-shrink-0 text-right">
                    <div className={`flex items-center gap-1 font-mono font-bold text-sm ${isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {isPositive && <ArrowUpRight className="w-3 h-3" />}
                      {isNegative && <ArrowDownRight className="w-3 h-3" />}
                      <span data-testid={`cash-delta-${activity.id}`}>
                        {isPositive ? '+' : ''}${activity.cashDelta}
                      </span>
                    </div>
                    {activity.balanceAfter && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Bal: ${activity.balanceAfter}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
