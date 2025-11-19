import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { useWebSocket } from "@/lib/websocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, Crown } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { invalidatePortfolioQueries } from "@/lib/cache-invalidation";
import type { Holding, Order, Player } from "@shared/schema";

interface PortfolioData {
  balance: string;
  portfolioValue: string;
  totalPnL: string;
  totalPnLPercent: string;
  holdings: (Holding & { player?: Player; currentValue: string; pnl: string; pnlPercent: string })[];
  openOrders: (Order & { player: Player })[];
  premiumShares: number;
  isPremium: boolean;
  premiumExpiresAt?: string;
}

export default function Portfolio() {
  const { toast } = useToast();
  const { subscribe } = useWebSocket();

  const { data, isLoading } = useQuery<PortfolioData>({
    queryKey: ["/api/portfolio"],
  });

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
    onSuccess: () => {
      toast({ title: "Order cancelled" });
      invalidatePortfolioQueries();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to cancel order", description: error.message, variant: "destructive" });
    },
  });

  const redeemPremiumMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/premium/redeem", {});
    },
    onSuccess: () => {
      toast({ title: "Premium activated!", description: "You now have premium access for 30 days" });
      invalidatePortfolioQueries();
    },
    onError: (error: Error) => {
      toast({ title: "Redemption failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading portfolio...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-4">
          <h1 className="text-3xl font-bold mb-4 sm:mb-6">Portfolio</h1>
          
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
                  <div className="flex-1 min-w-0 text-right">
                    <div className="text-muted-foreground uppercase tracking-wide mb-0.5">P&L</div>
                    <div className={`font-mono font-bold ${parseFloat(data?.totalPnL || "0") >= 0 ? 'text-positive' : 'text-negative'}`} data-testid="text-total-pnl">
                      {parseFloat(data?.totalPnL || "0") >= 0 ? '+' : ''}${data?.totalPnL}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Desktop Layout - 3 separate cards */}
            <div className="hidden md:grid md:grid-cols-3 gap-3">
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
            </div>
          </div>
        </div>

        <Tabs defaultValue="holdings" className="space-y-3 sm:space-y-3">
          <TabsList>
            <TabsTrigger value="holdings" data-testid="tab-holdings">Holdings</TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-open-orders">Open Orders</TabsTrigger>
          </TabsList>

          {/* Holdings */}
          <TabsContent value="holdings">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-wide">Your Holdings</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!data?.premiumShares && data?.holdings.filter(h => h.assetType === "player").length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground" data-testid="text-no-holdings">No holdings yet. Start trading to build your portfolio!</div>
                ) : (
                  <div>
                    <table className="w-full">
                      <thead className="border-b bg-muted/50 hidden sm:table-header-group">
                        <tr>
                          <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asset</th>
                          <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantity</th>
                          <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avg Cost</th>
                          <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">Current Price</th>
                          <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden lg:table-cell">Market Value</th>
                          <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">P&L</th>
                          <th className="px-2 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                      {(data?.premiumShares ?? 0) > 0 && (
                        <tr className="border-b hover-elevate" data-testid="row-premium-shares">
                          {/* Mobile layout */}
                          <td className="px-2 py-2 sm:hidden" colSpan={7}>
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
                          <td className="px-2 py-1.5 text-right font-mono hidden lg:table-cell">-</td>
                          <td className="px-2 py-1.5 text-right font-mono hidden sm:table-cell">-</td>
                          <td className="px-2 py-1.5 hidden sm:table-cell">
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
                      {data?.holdings.filter(h => h.assetType === "player").map((holding) => (
                        <tr key={holding.id} className="border-b last:border-0 hover-elevate" data-testid={`row-holding-${holding.player?.id}`}>
                          {/* Mobile layout - stacked info matching marketplace */}
                          <td className="px-2 py-2 sm:hidden" colSpan={7}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <span className="font-bold text-xs">{holding.player?.firstName[0]}{holding.player?.lastName[0]}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-sm">{holding.player?.firstName} {holding.player?.lastName}</div>
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
                                    <span className="font-mono font-bold text-foreground">
                                      {holding.player?.lastTradePrice ? `$${holding.player.lastTradePrice}` : '-'}
                                    </span>
                                    {holding.pnl !== null && (
                                      <>
                                        <span className="text-muted-foreground">•</span>
                                        <span className={parseFloat(holding.pnl) >= 0 ? 'text-positive' : 'text-negative'}>
                                          {parseFloat(holding.pnl) >= 0 ? '+' : ''}${holding.pnl} ({parseFloat(holding.pnlPercent) >= 0 ? '+' : ''}{holding.pnlPercent}%)
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <Link href={`/player/${holding.player?.id}`}>
                                <Button size="sm" data-testid={`button-trade-${holding.player?.id}`}>Trade</Button>
                              </Link>
                            </div>
                          </td>

                          {/* Desktop layout - table cells */}
                          <td className="px-2 py-1.5 hidden sm:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <span className="font-bold text-xs">{holding.player?.firstName[0]}{holding.player?.lastName[0]}</span>
                              </div>
                              <div>
                                <div className="font-medium text-sm">{holding.player?.firstName} {holding.player?.lastName}</div>
                                <div className="text-xs text-muted-foreground md:hidden">{holding.player?.team} • {holding.player?.position}</div>
                                <div className="text-xs text-muted-foreground hidden md:inline">{holding.player?.team} • {holding.player?.position}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-sm hidden sm:table-cell">{holding.quantity}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-sm hidden sm:table-cell">${holding.avgCostBasis}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-sm hidden md:table-cell">
                            {holding.player?.lastTradePrice ? `$${holding.player.lastTradePrice}` : <span className="text-muted-foreground text-xs">-</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-sm hidden lg:table-cell">
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
                          <td className="px-2 py-1.5 hidden sm:table-cell">
                            <Link href={`/player/${holding.player?.id}`}>
                              <Button size="sm" data-testid={`button-trade-desktop-${holding.player?.id}`}>Trade</Button>
                            </Link>
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
                  <div className="p-12 text-center text-muted-foreground">No open orders</div>
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
                                <div className="font-medium">{order.player.firstName} {order.player.lastName}</div>
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
        </Tabs>
      </div>
    </div>
  );
}
