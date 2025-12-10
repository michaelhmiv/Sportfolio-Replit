import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Crown, TrendingUp, TrendingDown, Loader2, ShoppingCart, Gift } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { invalidatePortfolioQueries } from "@/lib/cache-invalidation";
import { Link } from "wouter";
import type { Order, Trade } from "@shared/schema";

interface PremiumTradeData {
  premiumShares: number;
  userBalance: string;
  orderBook: {
    bids: { price: string; quantity: number; userId: string }[];
    asks: { price: string; quantity: number; userId: string }[];
  };
  recentTrades: (Trade & { buyer: { username: string }; seller: { username: string } })[];
  isPremium: boolean;
}

// Default price suggestion for new orders - actual market price is determined by trades
const DEFAULT_PRICE_SUGGESTION = 5.00;

export default function PremiumTradePage() {
  const searchString = useSearch();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState(DEFAULT_PRICE_SUGGESTION.toFixed(2));
  const [hasAppliedUrlParams, setHasAppliedUrlParams] = useState(false);

  // Fetch premium trading data
  const { data, isLoading, refetch } = useQuery<PremiumTradeData>({
    queryKey: ["/api/premium/trade"],
    enabled: isAuthenticated,
  });

  // Read URL query parameters to pre-fill order form
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

  // Place order mutation
  const orderMutation = useMutation({
    mutationFn: async (orderData: {
      side: "buy" | "sell";
      quantity: number;
      orderType: "limit" | "market";
      limitPrice?: string;
    }) => {
      const res = await apiRequest("POST", "/api/premium/orders", orderData);
      return res.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Order Placed!",
        description: `${side.toUpperCase()} order for ${quantity} premium share(s) placed successfully.`,
      });
      setQuantity("");
      refetch();
      invalidatePortfolioQueries();
      queryClient.invalidateQueries({ queryKey: ["/api/premium/status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Order Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) {
      toast({
        title: "Invalid Quantity",
        description: "Please enter a valid quantity.",
        variant: "destructive",
      });
      return;
    }

    orderMutation.mutate({
      side,
      quantity: qty,
      orderType,
      limitPrice: orderType === "limit" ? limitPrice : undefined,
    });
  };

  const balance = parseFloat(data?.userBalance || "0");
  const holding = data?.premiumShares || 0;
  const orderValue = parseFloat(quantity || "0") * parseFloat(limitPrice || DEFAULT_PRICE_SUGGESTION.toString());
  
  // Get last trade price from recent trades (market price is determined by actual trades)
  const lastTradePrice = data?.recentTrades && data.recentTrades.length > 0 
    ? parseFloat(data.recentTrades[0].price) 
    : null;

  // Validation
  const canBuy = side === "buy" && balance >= orderValue && parseInt(quantity) > 0;
  const canSell = side === "sell" && holding >= parseInt(quantity || "0") && parseInt(quantity) > 0;
  const canSubmit = orderType === "market" 
    ? (side === "buy" ? canBuy : canSell)
    : (side === "buy" ? canBuy : canSell);

  if (!isAuthenticated) {
    return (
      <div className="container max-w-4xl mx-auto p-4 md:p-6">
        <Card className="text-center p-8">
          <Crown className="h-16 w-16 mx-auto mb-4 text-yellow-500" />
          <CardTitle className="mb-4">Trade Premium Shares</CardTitle>
          <p className="text-muted-foreground mb-6">
            Sign in to trade Premium Shares on the marketplace.
          </p>
          <Link href="/">
            <Button data-testid="button-signin-trade">Sign In to Continue</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container max-w-6xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center">
          <Crown className="h-8 w-8 text-black" />
        </div>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-premium-trade-title">
            Premium Share
            <Badge className="bg-yellow-500 text-black">TRADEABLE</Badge>
          </h1>
          <p className="text-muted-foreground">Trade premium shares with other users</p>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-yellow-500/5 to-amber-500/5 border-yellow-500/20">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Last Trade</div>
            <div className="text-2xl font-bold text-yellow-500" data-testid="text-premium-price">
              {lastTradePrice !== null ? `$${lastTradePrice.toFixed(2)}` : "No trades yet"}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Your Holdings</div>
            <div className="text-2xl font-bold" data-testid="text-premium-holding">
              {holding} share{holding !== 1 ? 's' : ''}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Cash Balance</div>
            <div className="text-2xl font-bold text-green-500">
              ${balance.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Disclaimer */}
      <div className="bg-muted/50 border border-muted rounded-lg p-3 text-sm text-muted-foreground">
        Premium shares are <span className="font-medium text-foreground">in-game consumable items</span>. 
        They can be redeemed for premium access or traded with other users for in-game currency. 
        Premium shares have no cash value and <span className="font-medium text-foreground">cannot be withdrawn for real money</span>.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Place Order
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Buy/Sell Toggle */}
            <Tabs value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger 
                  value="buy" 
                  className="data-[state=active]:bg-green-500 data-[state=active]:text-white"
                  data-testid="tab-buy"
                >
                  <TrendingUp className="h-4 w-4 mr-1" />
                  Buy
                </TabsTrigger>
                <TabsTrigger 
                  value="sell"
                  className="data-[state=active]:bg-red-500 data-[state=active]:text-white"
                  data-testid="tab-sell"
                >
                  <TrendingDown className="h-4 w-4 mr-1" />
                  Sell
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Order Type */}
            <Tabs value={orderType} onValueChange={(v) => setOrderType(v as "limit" | "market")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="limit" data-testid="tab-limit">Limit</TabsTrigger>
                <TabsTrigger value="market" data-testid="tab-market">Market</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Price Input (for limit orders) */}
            {orderType === "limit" && (
              <div>
                <label className="text-sm text-muted-foreground">Price per Share</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    className="pl-7"
                    data-testid="input-limit-price"
                  />
                </div>
              </div>
            )}

            {/* Quantity Input */}
            <div>
              <label className="text-sm text-muted-foreground">Quantity</label>
              <Input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter quantity"
                className="mt-1"
                data-testid="input-quantity"
              />
              {side === "sell" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 text-xs"
                  onClick={() => setQuantity(holding.toString())}
                  data-testid="button-max-quantity"
                >
                  Max: {holding}
                </Button>
              )}
            </div>

            {/* Order Summary */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Order Value:</span>
                <span className="font-medium">${orderValue.toFixed(2)}</span>
              </div>
              {side === "buy" && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Available:</span>
                  <span>${balance.toFixed(2)}</span>
                </div>
              )}
              {side === "sell" && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Available to Sell:</span>
                  <span>{holding} shares</span>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <Button
              className={`w-full ${
                side === "buy" 
                  ? "bg-green-500 hover:bg-green-600" 
                  : "bg-red-500 hover:bg-red-600"
              }`}
              disabled={!canSubmit || orderMutation.isPending}
              onClick={handleSubmit}
              data-testid="button-submit-order"
            >
              {orderMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {side === "buy" ? "Buy" : "Sell"} {quantity || 0} Share{parseInt(quantity) !== 1 ? 's' : ''}
            </Button>

            {/* Error Messages */}
            {side === "buy" && balance < orderValue && parseInt(quantity) > 0 && (
              <p className="text-sm text-red-500">Insufficient balance</p>
            )}
            {side === "sell" && holding < parseInt(quantity || "0") && parseInt(quantity) > 0 && (
              <p className="text-sm text-red-500">Insufficient shares</p>
            )}
          </CardContent>
        </Card>

        {/* Order Book */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Order Book</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Asks (Sell orders) */}
              <div>
                <div className="text-sm font-medium text-red-500 mb-2">Sell Orders (Asks)</div>
                {data?.orderBook?.asks && data.orderBook.asks.length > 0 ? (
                  <div className="space-y-1">
                    {data.orderBook.asks.slice(0, 5).map((ask, i) => (
                      <div 
                        key={i} 
                        className="flex justify-between text-sm bg-red-500/10 px-2 py-1 rounded cursor-pointer hover:bg-red-500/20"
                        onClick={() => {
                          setSide("buy");
                          setLimitPrice(ask.price);
                          setOrderType("limit");
                        }}
                      >
                        <span className="text-red-500">${parseFloat(ask.price).toFixed(2)}</span>
                        <span>{ask.quantity}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-2">No sell orders</div>
                )}
              </div>

              {/* Spread / Last Trade */}
              <div className="text-center py-2 border-y">
                {lastTradePrice !== null ? (
                  <>
                    <span className="text-lg font-bold text-yellow-500">${lastTradePrice.toFixed(2)}</span>
                    <span className="text-xs text-muted-foreground ml-2">Last Trade</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">No trades yet</span>
                )}
              </div>

              {/* Bids (Buy orders) */}
              <div>
                <div className="text-sm font-medium text-green-500 mb-2">Buy Orders (Bids)</div>
                {data?.orderBook?.bids && data.orderBook.bids.length > 0 ? (
                  <div className="space-y-1">
                    {data.orderBook.bids.slice(0, 5).map((bid, i) => (
                      <div 
                        key={i} 
                        className="flex justify-between text-sm bg-green-500/10 px-2 py-1 rounded cursor-pointer hover:bg-green-500/20"
                        onClick={() => {
                          setSide("sell");
                          setLimitPrice(bid.price);
                          setOrderType("limit");
                        }}
                      >
                        <span className="text-green-500">${parseFloat(bid.price).toFixed(2)}</span>
                        <span>{bid.quantity}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-2">No buy orders</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions & Info */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-yellow-500" />
              Premium Benefits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gradient-to-br from-yellow-500/10 to-amber-500/10 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Crown className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div>
                  <div className="font-medium">Double Vesting Rate</div>
                  <div className="text-sm text-muted-foreground">
                    200 shares/hour (vs 100 for free users)
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Crown className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div>
                  <div className="font-medium">Higher Vesting Cap</div>
                  <div className="text-sm text-muted-foreground">
                    4,800 shares/day (vs 2,400 for free users)
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Crown className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div>
                  <div className="font-medium">Ad-Free Experience</div>
                  <div className="text-sm text-muted-foreground">
                    No advertisements while premium is active
                  </div>
                </div>
              </div>
            </div>

            {holding > 0 && (
              <Link href="/premium">
                <Button 
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
                  data-testid="button-redeem-share"
                >
                  <Crown className="h-4 w-4 mr-2" />
                  Redeem Share for 30 Days Premium
                </Button>
              </Link>
            )}

            <Link href="/premium">
              <Button variant="outline" className="w-full" data-testid="button-buy-more">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Buy More Shares ($5 each)
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.recentTrades && data.recentTrades.length > 0 ? (
            <div className="space-y-2">
              {data.recentTrades.map((trade, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={trade.buyer ? "text-green-500" : "text-red-500"}>
                      {trade.buyer ? "BUY" : "SELL"}
                    </Badge>
                    <span className="text-sm">
                      {trade.buyer?.username || "Unknown"} → {trade.seller?.username || "Unknown"}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{trade.quantity} @ ${parseFloat(trade.price).toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(trade.executedAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No trades yet. Be the first to trade!
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
