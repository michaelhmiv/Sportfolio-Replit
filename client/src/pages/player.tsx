import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useSearch } from "wouter";
import { useWebSocket } from "@/lib/websocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { invalidatePortfolioQueries } from "@/lib/cache-invalidation";
import type { Player, Order, Trade, PriceHistory } from "@shared/schema";
import { SchemaOrg, schemas } from "@/components/schema-org";
import { AnimatedPrice } from "@/components/ui/animated-price";
import { Confetti, CelebrationBurst } from "@/components/ui/confetti";
import { AnimatedButton } from "@/components/ui/animations";

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
  const searchString = useSearch();
  const { toast } = useToast();
  const { subscribe } = useWebSocket();
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("1D");
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [hasAppliedUrlParams, setHasAppliedUrlParams] = useState(false);

  const { data, isLoading } = useQuery<PlayerPageData>({
    queryKey: ["/api/player", id],
  });

  // Read URL query parameters to pre-fill order form (from portfolio bid/ask clicks)
  useEffect(() => {
    if (hasAppliedUrlParams) return;
    
    const params = new URLSearchParams(searchString);
    const actionParam = params.get("action");
    const priceParam = params.get("price");
    
    if (actionParam && priceParam) {
      if (actionParam === "buy" || actionParam === "sell") {
        setSide(actionParam);
        setOrderType("limit");
        setLimitPrice(priceParam);
        setHasAppliedUrlParams(true);
        
        toast({
          title: "Order form pre-filled",
          description: `Set to ${actionParam.toUpperCase()} at $${priceParam}. Enter quantity to complete.`,
          duration: 4000
        });
      }
    }
  }, [searchString, hasAppliedUrlParams, toast]);

  // Fetch contest performance data
  const { data: contestData } = useQuery<{
    contestPerformance: {
      totalAppearances: number;
      completedContests: number;
      totalEarnings: string;
      avgFantasyPoints: string;
      winRate: string;
    } | null;
  }>({
    queryKey: ["/api/player", id, "contest-earnings"],
    enabled: !!id,
  });

  // WebSocket listener for real-time player page updates
  useEffect(() => {
    if (!id) return;

    // Subscribe to trade events for this player
    const unsubTrade = subscribe('trade', (data) => {
      if (data.playerId === id) {
        queryClient.invalidateQueries({ queryKey: ["/api/player", id] });
      }
    });

    // Subscribe to order book changes for this player
    const unsubOrderBook = subscribe('orderBook', (data) => {
      if (data.playerId === id) {
        queryClient.invalidateQueries({ queryKey: ["/api/player", id] });
      }
    });

    // Subscribe to portfolio events (affects user balance and holdings)
    const unsubPortfolio = subscribe('portfolio', () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player", id] });
    });

    return () => {
      unsubTrade();
      unsubOrderBook();
      unsubPortfolio();
    };
  }, [id, subscribe]);

  // SEO: Update meta tags when player data loads
  useEffect(() => {
    if (!data?.player) return;
    
    const player = data.player;
    const playerName = `${player.firstName} ${player.lastName}`;
    const price = player.currentPrice || player.lastTradePrice;
    
    // Sanitize price for meta tags - only use $ for valid numeric values
    let priceText = 'No market value yet';
    if (price && price !== 'N/A' && !isNaN(parseFloat(price))) {
      priceText = `Current price: $${price}`;
    }
    
    const title = `${playerName} - ${player.team} ${player.position} | Trade Shares on Sportfolio`;
    const description = `Trade ${playerName} shares on Sportfolio. ${priceText}. View stats, order book, and recent trades for ${player.team} ${player.position}.`;
    
    // Store original values for cleanup
    const originalTitle = document.title;
    const originalDescription = document.querySelector('meta[name="description"]')?.getAttribute('content');
    
    document.title = title;
    
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', description);
    }
    
    // Open Graph tags - track which ones we create
    const createdMetaTags: HTMLMetaElement[] = [];
    const ogTags = [
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'profile' },
      { property: 'og:url', content: `${window.location.origin}/player/${player.id}` },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ];
    
    ogTags.forEach(tag => {
      const property = (tag.property || tag.name) as string;
      const attr = tag.property ? 'property' : 'name';
      let meta = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement;
      
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, property);
        document.head.appendChild(meta);
        createdMetaTags.push(meta);
      }
      meta.setAttribute('content', tag.content);
    });
    
    return () => {
      document.title = originalTitle || 'Sportfolio - Fantasy Sports Stock Market';
      if (originalDescription && metaDescription) {
        metaDescription.setAttribute('content', originalDescription);
      }
      // Remove any meta tags we created
      createdMetaTags.forEach(meta => meta.remove());
    };
  }, [data?.player]);

  const placeOrderMutation = useMutation({
    mutationFn: async (orderData: { orderType: string; side: string; quantity: number; limitPrice?: string }) => {
      return await apiRequest("POST", `/api/orders/${id}`, orderData);
    },
    onSuccess: async () => {
      await invalidatePortfolioQueries();
      setCelebrationKey(prev => prev + 1);
      toast({ title: "Order placed successfully" });
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
      // Market order uses best available price or last trade price as estimate (never placeholder currentPrice)
      const price = side === "buy" 
        ? parseFloat(data?.orderBook.asks[0]?.price || data?.player.lastTradePrice || "0")
        : parseFloat(data?.orderBook.bids[0]?.price || data?.player.lastTradePrice || "0");
      return (qty * price).toFixed(2);
    }
  };

  const setMaxQuantity = () => {
    if (side === "buy") {
      const price = orderType === "limit" 
        ? parseFloat(limitPrice) || parseFloat(data?.player.lastTradePrice || "0")
        : parseFloat(data?.orderBook.asks[0]?.price || data?.player.lastTradePrice || "0");
      
      if (price <= 0) return; // Avoid division by zero
      const maxQty = Math.floor(parseFloat(data?.userBalance || "0") / price);
      setQuantity(maxQty.toString());
    } else {
      setQuantity((data?.userHolding?.quantity || 0).toString());
    }
  };

  // Handler for clicking a bid in the order book (auto-fill SELL form)
  const handleBidClick = (bid: { price: string; quantity: number }) => {
    setSide("sell");
    setOrderType("limit");
    setLimitPrice(bid.price);
    setQuantity(bid.quantity.toString());
    toast({ 
      title: "Order form updated", 
      description: `Set to SELL ${bid.quantity} shares at $${bid.price}`,
      duration: 3000
    });
  };

  // Handler for clicking an ask in the order book (auto-fill BUY form)
  const handleAskClick = (ask: { price: string; quantity: number }) => {
    setSide("buy");
    setOrderType("limit");
    setLimitPrice(ask.price);
    setQuantity(ask.quantity.toString());
    toast({ 
      title: "Order form updated", 
      description: `Set to BUY ${ask.quantity} shares at $${ask.price}`,
      duration: 3000
    });
  };

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading player...</div>
      </div>
    );
  }

  const { player, priceHistory, orderBook, recentTrades } = data;
  const playerName = `${player.firstName} ${player.lastName}`;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      {celebrationKey > 0 && (
        <>
          <Confetti 
            key={`confetti-${celebrationKey}`}
            active={true} 
            type="coins" 
            particleCount={30}
            duration={2000}
          />
          <CelebrationBurst 
            key={`burst-${celebrationKey}`}
            active={true} 
          />
        </>
      )}
      <SchemaOrg schema={schemas.createPlayer({
        name: playerName,
        team: player.team,
        position: player.position,
        id: player.id
      })} />
      <div className="max-w-7xl mx-auto">
        {/* Player Header */}
        <div className="mb-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
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
              <div className="text-hero font-mono font-bold" data-testid="text-current-price">
                {player.lastTradePrice ? (
                  <AnimatedPrice 
                    value={parseFloat(player.lastTradePrice)} 
                    size="lg" 
                    className="text-4xl justify-end"
                  />
                ) : (
                  <span className="text-muted-foreground text-2xl">No market value</span>
                )}
              </div>
              {player.lastTradePrice && (
                <div className={`flex items-center justify-end gap-1 ${parseFloat(player.priceChange24h) >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {parseFloat(player.priceChange24h) >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  <span className="text-xl font-medium">
                    {parseFloat(player.priceChange24h) >= 0 ? '+' : ''}{player.priceChange24h}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Chart */}
          <div className="lg:col-span-2 space-y-3">
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
                {priceHistory.length > 0 ? (
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
                        isAnimationActive={true}
                        animationDuration={1200}
                        animationEasing="ease-out"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground" data-testid="text-no-price-data">
                    <div className="text-center">
                      <p className="text-sm">No trade data available</p>
                      <p className="text-xs mt-1">This player has not been traded yet</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Order Book & Recent Trades */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                          <div 
                            key={idx} 
                            className="flex justify-between text-sm cursor-pointer hover-elevate active-elevate-2 rounded-sm px-1 py-0.5 -mx-1" 
                            onClick={() => handleBidClick(bid)}
                            data-testid={`bid-${idx}`}
                          >
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
                          <div 
                            key={idx} 
                            className="flex justify-between text-sm cursor-pointer hover-elevate active-elevate-2 rounded-sm px-1 py-0.5 -mx-1" 
                            onClick={() => handleAskClick(ask)}
                            data-testid={`ask-${idx}`}
                          >
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

            {/* Contest Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-wide">Contest Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Appearances</div>
                    <div className="text-xl font-bold" data-testid="text-contest-appearances">
                      {contestData?.contestPerformance?.totalAppearances ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Total Earnings</div>
                    <div className="text-xl font-bold text-positive" data-testid="text-contest-earnings">
                      ${contestData?.contestPerformance?.totalEarnings ?? "0.00"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Win Rate</div>
                    <div className="text-xl font-bold" data-testid="text-contest-winrate">
                      {contestData?.contestPerformance?.winRate ?? "0.0"}%
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
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
                <AnimatedButton
                  className="w-full"
                  size="lg"
                  onClick={handlePlaceOrder}
                  isLoading={placeOrderMutation.isPending}
                  isSuccess={placeOrderMutation.isSuccess}
                  loadingText="Placing..."
                  successText="Order Placed!"
                  data-testid="button-place-order"
                >
                  {side === "buy" ? "Buy" : "Sell"} Shares
                </AnimatedButton>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
