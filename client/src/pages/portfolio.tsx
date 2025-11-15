import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, Crown } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  const { data, isLoading } = useQuery<PortfolioData>({
    queryKey: ["/api/portfolio"],
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await apiRequest("POST", `/api/orders/${orderId}/cancel`, {});
    },
    onSuccess: () => {
      toast({ title: "Order cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
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
    <div className="min-h-screen bg-background p-3 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-8">
          <h1 className="text-3xl font-bold mb-4 sm:mb-6">Portfolio</h1>
          
          {/* Portfolio Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6 mb-4 sm:mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wide">Cash Balance</CardTitle>
                <DollarSign className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-mono font-bold" data-testid="text-cash-balance">${data?.balance}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wide">Portfolio Value</CardTitle>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-mono font-bold" data-testid="text-portfolio-value">${data?.portfolioValue}</div>
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
                <div className={`text-3xl font-mono font-bold ${parseFloat(data?.totalPnL || "0") >= 0 ? 'text-positive' : 'text-negative'}`} data-testid="text-total-pnl">
                  {parseFloat(data?.totalPnL || "0") >= 0 ? '+' : ''}${data?.totalPnL}
                </div>
                <div className={`text-sm ${parseFloat(data?.totalPnL || "0") >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {parseFloat(data?.totalPnL || "0") >= 0 ? '+' : ''}{data?.totalPnLPercent}%
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs defaultValue="holdings" className="space-y-3 sm:space-y-6">
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
                {/* Mobile: Card Layout */}
                <div className="sm:hidden p-3 space-y-3">
                  {/* Premium Shares Mobile */}
                  {data?.premiumShares && data.premiumShares > 0 && (
                    <Card className="hover-elevate" data-testid="row-premium-shares">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <Crown className="w-12 h-12 text-primary" />
                            <div>
                              <div className="font-medium">Premium Share</div>
                              <div className="text-xs text-muted-foreground">Redeemable for 30 days access</div>
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
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Quantity</div>
                            <div className="font-mono">{data.premiumShares}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Player Holdings Mobile */}
                  {data?.holdings.filter(h => h.assetType === "player").map((holding) => (
                    <Card key={holding.id} className="hover-elevate" data-testid={`row-holding-${holding.player?.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="font-bold">
                                {holding.player?.firstName[0]}{holding.player?.lastName[0]}
                              </span>
                            </div>
                            <div>
                              <div className="font-medium">{holding.player?.firstName} {holding.player?.lastName}</div>
                              <div className="text-xs text-muted-foreground">{holding.player?.team} · {holding.player?.position}</div>
                            </div>
                          </div>
                          <Link href={`/player/${holding.player?.id}`}>
                            <Button size="sm" variant="outline">Trade</Button>
                          </Link>
                        </div>
                        <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Quantity</div>
                            <div className="font-mono text-sm">{holding.quantity}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Avg Cost</div>
                            <div className="font-mono text-sm">${holding.avgCostBasis}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Current</div>
                            <div className="font-mono text-sm">${holding.player?.currentPrice}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Value</div>
                            <div className="font-mono font-bold">${holding.currentValue}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">P&L</div>
                            <div className={parseFloat(holding.pnl) >= 0 ? 'text-positive' : 'text-negative'}>
                              <div className="font-mono font-medium text-sm">
                                {parseFloat(holding.pnl) >= 0 ? '+' : ''}${holding.pnl}
                              </div>
                              <div className="text-xs">
                                ({parseFloat(holding.pnlPercent) >= 0 ? '+' : ''}{holding.pnlPercent}%)
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Desktop: Table Layout */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b bg-muted/50">
                      <tr>
                        <th className="text-left p-2 sm:p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asset</th>
                        <th className="text-right p-2 sm:p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantity</th>
                        <th className="text-right p-2 sm:p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avg Cost</th>
                        <th className="text-right p-2 sm:p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Price</th>
                        <th className="text-right p-2 sm:p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Value</th>
                        <th className="text-right p-2 sm:p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">P&L</th>
                        <th className="p-2 sm:p-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.premiumShares && data.premiumShares > 0 && (
                        <tr className="border-b hover-elevate" data-testid="row-premium-shares">
                          <td className="p-2 sm:p-4">
                            <div className="flex items-center gap-3">
                              <Crown className="w-8 h-8 text-primary" />
                              <div>
                                <div className="font-medium">Premium Share</div>
                                <div className="text-xs text-muted-foreground">Redeemable for 30 days access</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-2 sm:p-4 text-right font-mono">{data.premiumShares}</td>
                          <td className="p-2 sm:p-4 text-right font-mono">-</td>
                          <td className="p-2 sm:p-4 text-right font-mono">-</td>
                          <td className="p-2 sm:p-4 text-right font-mono">-</td>
                          <td className="p-2 sm:p-4 text-right font-mono">-</td>
                          <td className="p-2 sm:p-4">
                            <Button
                              size="sm"
                              onClick={() => redeemPremiumMutation.mutate()}
                              disabled={redeemPremiumMutation.isPending || data.isPremium}
                              data-testid="button-redeem-premium"
                            >
                              {data.isPremium ? "Active" : "Redeem"}
                            </Button>
                          </td>
                        </tr>
                      )}
                      {data?.holdings.filter(h => h.assetType === "player").map((holding) => (
                        <tr key={holding.id} className="border-b hover-elevate" data-testid={`row-holding-${holding.player?.id}`}>
                          <td className="p-2 sm:p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="font-bold text-sm">
                                  {holding.player?.firstName[0]}{holding.player?.lastName[0]}
                                </span>
                              </div>
                              <div>
                                <div className="font-medium">{holding.player?.firstName} {holding.player?.lastName}</div>
                                <div className="text-xs text-muted-foreground">{holding.player?.team} · {holding.player?.position}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-2 sm:p-4 text-right font-mono">{holding.quantity}</td>
                          <td className="p-2 sm:p-4 text-right font-mono">${holding.avgCostBasis}</td>
                          <td className="p-2 sm:p-4 text-right font-mono">${holding.player?.currentPrice}</td>
                          <td className="p-2 sm:p-4 text-right font-mono font-bold">${holding.currentValue}</td>
                          <td className="p-2 sm:p-4 text-right">
                            <div className={parseFloat(holding.pnl) >= 0 ? 'text-positive' : 'text-negative'}>
                              <div className="font-mono font-medium">
                                {parseFloat(holding.pnl) >= 0 ? '+' : ''}${holding.pnl}
                              </div>
                              <div className="text-xs">
                                ({parseFloat(holding.pnlPercent) >= 0 ? '+' : ''}{holding.pnlPercent}%)
                              </div>
                            </div>
                          </td>
                          <td className="p-2 sm:p-4">
                            <Link href={`/player/${holding.player?.id}`}>
                              <Button size="sm" variant="outline">Trade</Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                  <>
                    {/* Mobile: Card Layout */}
                    <div className="sm:hidden p-3 space-y-3">
                      {data?.openOrders.map((order) => (
                        <Card key={order.id} className="hover-elevate" data-testid={`row-order-${order.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="capitalize">{order.orderType}</Badge>
                                <Badge className={order.side === "buy" ? "bg-positive" : "bg-negative"}>
                                  {order.side.toUpperCase()}
                                </Badge>
                              </div>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => cancelOrderMutation.mutate(order.id)}
                                disabled={cancelOrderMutation.isPending}
                                data-testid={`button-cancel-${order.id}`}
                              >
                                Cancel
                              </Button>
                            </div>
                            <div className="mb-3">
                              <div className="font-medium">{order.player.firstName} {order.player.lastName}</div>
                              <div className="text-xs text-muted-foreground">{order.player.team}</div>
                            </div>
                            <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Quantity</div>
                                <div className="font-mono text-sm">{order.quantity}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Price</div>
                                <div className="font-mono text-sm">
                                  {order.limitPrice ? `$${order.limitPrice}` : "Market"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Filled</div>
                                <div className="font-mono text-sm">{order.filledQuantity}</div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Desktop: Table Layout */}
                    <div className="hidden sm:block overflow-x-auto">
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
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
