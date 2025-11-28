import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useWebSocket } from "@/lib/websocket";
import { queryClient } from "@/lib/queryClient";
import { PlayerName } from "@/components/player-name";
import { UserName } from "@/components/user-name";

interface MarketActivity {
  activityType: "trade" | "order_placed" | "order_cancelled";
  id: string;
  playerId: string;
  playerFirstName: string;
  playerLastName: string;
  playerTeam: string;
  userId: string | null;
  username: string | null;
  buyerId: string | null;
  buyerUsername: string | null;
  sellerId: string | null;
  sellerUsername: string | null;
  side: "buy" | "sell" | null;
  orderType: "limit" | "market" | null;
  quantity: number;
  price: string | null;
  limitPrice: string | null;
  timestamp: string;
}

export function MarketActivityWidget() {
  const { subscribe } = useWebSocket();
  
  const { data: activity = [], isLoading } = useQuery<MarketActivity[]>({
    queryKey: ["/api/market/activity"],
    queryFn: async () => {
      const response = await fetch("/api/market/activity?limit=10");
      if (!response.ok) throw new Error("Failed to fetch market activity");
      return response.json();
    },
  });

  // Subscribe to WebSocket market activity events for real-time updates
  useEffect(() => {
    const unsubscribe = subscribe('marketActivity', () => {
      queryClient.invalidateQueries({ queryKey: ['/api/market/activity'] });
    });
    return unsubscribe;
  }, [subscribe]);

  const getActivityIcon = (item: MarketActivity) => {
    if (item.activityType === "trade") {
      return <span className="text-blue-500 font-bold text-lg">▲</span>;
    }
    if (item.side === "buy") {
      return <span className="text-blue-500 font-bold text-lg">▲</span>;
    }
    return <span className="text-red-500 font-bold text-lg">▼</span>;
  };

  const getActivityText = (item: MarketActivity) => {
    if (item.activityType === "trade") {
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-muted-foreground text-xs">Trade:</span>
          {item.buyerId && item.buyerUsername && (
            <span className="font-medium text-xs">
              <UserName userId={item.buyerId} username={item.buyerUsername} className="text-xs" />
            </span>
          )}
          <span className="text-muted-foreground text-xs">bought from</span>
          {item.sellerId && item.sellerUsername && (
            <span className="font-medium text-xs">
              <UserName userId={item.sellerId} username={item.sellerUsername} className="text-xs" />
            </span>
          )}
        </div>
      );
    }
    if (item.activityType === "order_placed") {
      return (
        <div className="flex items-center gap-1 flex-wrap">
          {item.userId && item.username && (
            <span className="font-medium text-xs">
              <UserName userId={item.userId} username={item.username} className="text-xs" />
            </span>
          )}
          <Badge variant="outline" className="text-xs">
            {item.side} {item.orderType}
          </Badge>
        </div>
      );
    }
    if (item.activityType === "order_cancelled") {
      return (
        <div className="flex items-center gap-1 flex-wrap">
          {item.userId && item.username && (
            <span className="font-medium text-xs">
              <UserName userId={item.userId} username={item.username} className="text-xs" />
            </span>
          )}
          <Badge variant="outline" className="text-xs">cancelled</Badge>
        </div>
      );
    }
  };

  if (isLoading) {
    return (
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wide">Market Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide">Market Activity</CardTitle>
        <Clock className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        {activity.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">No recent activity</div>
        ) : (
          <>
            <div className="space-y-2">
              {activity.slice(0, 5).map((item) => (
                <div
                  key={`${item.activityType}-${item.id}`}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                  data-testid={`activity-${item.activityType}-${item.id}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">{getActivityIcon(item)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">
                        <PlayerName 
                          playerId={item.playerId} 
                          firstName={item.playerFirstName} 
                          lastName={item.playerLastName}
                          className="text-sm"
                        />
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{item.playerTeam}</div>
                      {getActivityText(item)}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <div className="font-mono font-bold text-sm">
                      {item.price ? `$${item.price}` : item.limitPrice ? `$${item.limitPrice}` : "-"}
                    </div>
                    <div className="text-xs text-muted-foreground">{item.quantity} shares</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/marketplace?tab=activity">
              <Button variant="outline" className="w-full" data-testid="button-view-market-activity">
                View More Activity
              </Button>
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
