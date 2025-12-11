import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Crown, TrendingUp, Users } from "lucide-react";
import { format } from "date-fns";

type TimePeriod = "1D" | "1W" | "1M" | "3M" | "ALL";

interface PriceHistoryPoint {
  timestamp: string;
  price: number;
  volume: number;
}

interface PremiumMarketData {
  lastTradePrice: number | null;
  bestBid: { price: number; quantity: number } | null;
  bestAsk: { price: number; quantity: number } | null;
  circulation: number;
  priceHistory: PriceHistoryPoint[];
  totalTrades: number;
  period: string;
}

export function PremiumPriceChart() {
  const [period, setPeriod] = useState<TimePeriod>("1M");

  const { data, isLoading } = useQuery<PremiumMarketData>({
    queryKey: ["/api/premium/market-data", period],
    queryFn: async () => {
      const res = await fetch(`/api/premium/market-data?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch market data");
      return res.json();
    },
  });

  const periods: TimePeriod[] = ["1D", "1W", "1M", "3M", "ALL"];

  const formatXAxis = (timestamp: string) => {
    const date = new Date(timestamp);
    if (period === "1D") {
      return format(date, "HH:mm");
    } else if (period === "1W" || period === "1M") {
      return format(date, "MMM d");
    } else {
      return format(date, "MMM yy");
    }
  };

  const formatTooltipDate = (timestamp: string) => {
    return format(new Date(timestamp), "MMM d, yyyy h:mm a");
  };

  const chartData = data?.priceHistory.map(point => ({
    ...point,
    circulation: data.circulation,
  })) || [];

  const hasData = chartData.length > 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-500" />
              <CardTitle className="text-lg">Premium Share Price History</CardTitle>
            </div>
            <div className="flex gap-1">
              {periods.map((p) => (
                <Skeleton key={p} className="h-8 w-10" />
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-lg" data-testid="text-premium-chart-title">
              Premium Share Price History
            </CardTitle>
          </div>
          <div className="flex gap-1">
            {periods.map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(p)}
                data-testid={`button-period-${p}`}
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-muted-foreground">Last Price:</span>
            <span className="font-mono font-bold" data-testid="text-last-price">
              {data?.lastTradePrice !== null && data?.lastTradePrice !== undefined
                ? `$${data.lastTradePrice.toFixed(2)}`
                : "No trades"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-blue-500" />
            <span className="text-muted-foreground">Circulation:</span>
            <span className="font-mono font-bold" data-testid="text-circulation">
              {data?.circulation ?? 0} shares
            </span>
          </div>
          <Badge variant="secondary" className="font-mono">
            {data?.totalTrades ?? 0} trades
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        {!hasData ? (
          <div className="h-[250px] flex items-center justify-center border border-dashed rounded-lg">
            <div className="text-center text-muted-foreground">
              <Crown className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p className="font-medium">No trade history available</p>
              <p className="text-sm">Price data will appear after trades occur</p>
            </div>
          </div>
        ) : (
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatXAxis}
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  yAxisId="price"
                  orientation="left"
                  tickFormatter={(value) => `$${value.toFixed(2)}`}
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  domain={['auto', 'auto']}
                />
                <YAxis
                  yAxisId="volume"
                  orientation="right"
                  tickFormatter={(value) => value.toString()}
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  hide
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  labelFormatter={formatTooltipDate}
                  formatter={(value: number, name: string) => {
                    if (name === "price") return [`$${value.toFixed(2)}`, "Price"];
                    if (name === "volume") return [value, "Volume"];
                    return [value, name];
                  }}
                />
                <Legend />
                <Area
                  yAxisId="price"
                  type="monotone"
                  dataKey="price"
                  stroke="hsl(var(--chart-1))"
                  fill="url(#priceGradient)"
                  strokeWidth={2}
                  name="price"
                  dot={chartData.length < 20}
                />
                <Line
                  yAxisId="volume"
                  type="monotone"
                  dataKey="volume"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  name="volume"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
