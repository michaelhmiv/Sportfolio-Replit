import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Player, Order, Trade, PriceHistory } from "@shared/schema";

interface PlayerPageData {
  player: Player;
  priceHistory: PriceHistory[];
  orderBook: {
    bids: { price: string; quantity: number }[];
    asks: { price: string; quantity: number }[];
  };
  recentTrades: (Trade & { buyer: { username: string }; seller: { username: string } })[];
  userBalance: string;
  userHolding?: { quantity: number; avgCostBasis: string };
}

type TimeRange = "1D" | "1W" | "1M" | "1Y";

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("1D");

  const { data, isLoading } = useQuery<PlayerPageData>({
    queryKey: ["/api/player", id],
  });

  const placeOrderMutation = useMutation({
    mutationFn: async (orderData: { orderType: string; side: string; quantity: number; limitPrice?: string }) => {
      return await apiRequest("POST", `/api/orders/${id}`, orderData);
    },
    onSuccess: () => {
      toast({ title: "Order placed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/player", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      setQuantity("");
      setLimitPrice("");
    },
    onError: (error: Error) => {
      toast({ title: "Order failed", description: error.message, variant: "destructive" });
    },
  });

  const handlePlaceOrder = () => {
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) {
      toast({ title: "Invalid quantity", variant: "destructive" });
      return;
    }

    const orderData: any = {
      orderType,
      side,
      quantity: qty,
    };

    if (orderType === "limit") {
      if (!limitPrice || parseFloat(limitPrice) <= 0) {
        toast({ title: "Invalid limit price", variant: "destructive" });
        return;
      }
      orderData.limitPrice = limitPrice;
    }

    placeOrderMutation.mutate(orderData);
  };

  const calculateTotal = () => {
    const qty = parseInt(quantity) || 0;
    if (orderType === "limit") {
      const price = parseFloat(limitPrice) || 0;
      return (qty * price).toFixed(2);
    } else {
      // Market order uses best available price
      const price = side === "buy" 
        ? parseFloat(data?.orderBook.asks[0]?.price || "0")
        : parseFloat(data?.orderBook.bids[0]?.price || "0");
      return (qty * price).toFixed(2);
    }
  };

  const setMaxQuantity = () => {
    if (side === "buy") {
      const price = orderType === "limit" 
        ? parseFloat(limitPrice) || parseFloat(data?.player.currentPrice || "0")
        : parseFloat(data?.orderBook.asks[0]?.price || "0");
      const maxQty = Math.floor(parseFloat(data?.userBalance || "0") / price);
      setQuantity(maxQty.toString());
    } else {
      setQuantity((data?.userHolding?.quantity || 0).toString());
    }
  };

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading player...</div>
      </div>
    );
  }

  const { player, priceHistory, orderBook, recentTrades } = data;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Player Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-2xl font-bold">{player.firstName[0]}{player.lastName[0]}</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold mb-1">{player.firstName} {player.lastName}</h1>
                <div className="flex items-center gap-2">
                  <Badge>{player.team}</Badge>
                  <Badge variant="outline">{player.position}</Badge>
                  {player.jerseyNumber && <span className="text-sm text-muted-foreground">#{player.jerseyNumber}</span>}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-hero font-mono font-bold" data-testid="text-current-price">${player.currentPrice}</div>
              <div className={`flex items-center justify-end gap-1 ${parseFloat(player.priceChange24h) >= 0 ? 'text-positive' : 'text-negative'}`}>
                {parseFloat(player.priceChange24h) >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                <span className="text-xl font-medium">
                  {parseFloat(player.priceChange24h) >= 0 ? '+' : ''}{player.priceChange24h}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium uppercase tracking-wide">Price Chart</CardTitle>
                  <div className="flex gap-1">
                    {(["1D", "1W", "1M", "1Y"] as TimeRange[]).map((range) => (
                      <Button
                        key={range}
                        size="sm"
                        variant={timeRange === range ? "default" : "ghost"}
                        onClick={() => setTimeRange(range)}
                        data-testid={`button-timerange-${range}`}
                      >
                        {range}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={priceHistory}>
                    <XAxis dataKey="timestamp" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--popover))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px"
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Order Book & Recent Trades */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium uppercase tracking-wide">Order Book</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-2 divide-x">
                    {/* Bids */}
                    <div>
                      <div className="p-2 bg-muted/50 text-xs font-semibold uppercase tracking-wide text-center">Bids</div>
                      <div className="space-y-1 p-2">
                        {orderBook.bids.slice(0, 5).map((bid, idx) => (
                          <div key={idx} className="flex justify-between text-sm" data-testid={`bid-${idx}`}>
                            <span className="font-mono text-positive font-medium">${bid.price}</span>
                            <span className="text-muted-foreground">{bid.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Asks */}
                    <div>
                      <div className="p-2 bg-muted/50 text-xs font-semibold uppercase tracking-wide text-center">Asks</div>
                      <div className="space-y-1 p-2">
                        {orderBook.asks.slice(0, 5).map((ask, idx) => (
                          <div key={idx} className="flex justify-between text-sm" data-testid={`ask-${idx}`}>
                            <span className="font-mono text-negative font-medium">${ask.price}</span>
                            <span className="text-muted-foreground">{ask.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium uppercase tracking-wide">Recent Trades</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {recentTrades.slice(0, 8).map((trade) => (
                      <div key={trade.id} className="p-3 flex justify-between items-center text-sm">
                        <div>
                          <span className="font-mono font-medium">${trade.price}</span>
                          <span className="text-muted-foreground ml-2">{trade.quantity} sh</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(trade.executedAt).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Trading Panel */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-wide">Trade</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Buy/Sell Tabs */}
                <Tabs value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="buy" data-testid="tab-buy">Buy</TabsTrigger>
                    <TabsTrigger value="sell" data-testid="tab-sell">Sell</TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Order Type */}
                <Tabs value={orderType} onValueChange={(v) => setOrderType(v as "limit" | "market")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="limit" data-testid="tab-limit">Limit</TabsTrigger>
                    <TabsTrigger value="market" data-testid="tab-market">Market</TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Quantity */}
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide">Quantity</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      data-testid="input-quantity"
                    />
                    <Button variant="outline" onClick={setMaxQuantity} data-testid="button-max">
                      Max
                    </Button>
                  </div>
                </div>

                {/* Limit Price */}
                {orderType === "limit" && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wide">Limit Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={limitPrice}
                        onChange={(e) => setLimitPrice(e.target.value)}
                        className="pl-6 font-mono"
                        data-testid="input-limit-price"
                      />
                    </div>
                  </div>
                )}

                {/* Total */}
                <div className="p-4 bg-muted rounded-md">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total {side === "buy" ? "Cost" : "Credit"}</span>
                    <span className="text-2xl font-mono font-bold" data-testid="text-total">
                      ${calculateTotal()}
                    </span>
                  </div>
                </div>

                {/* Available Balance */}
                <div className="text-xs text-muted-foreground">
                  Available: ${data.userBalance}
                  {data.userHolding && ` · ${data.userHolding.quantity} shares owned`}
                </div>

                {/* Submit Button */}
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePlaceOrder}
                  disabled={placeOrderMutation.isPending}
                  data-testid="button-place-order"
                >
                  {placeOrderMutation.isPending ? "Placing..." : `${side === "buy" ? "Buy" : "Sell"} Shares`}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
