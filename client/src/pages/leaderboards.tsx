import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, TrendingUp, ShoppingCart, DollarSign } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  value: number | string;
}

interface LeaderboardData {
  category: string;
  leaderboard: LeaderboardEntry[];
}

export default function Leaderboards() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  
  // Get initial category from URL hash
  const getHashCategory = () => {
    const hash = window.location.hash.replace("#", "") || "netWorth";
    return ["netWorth", "sharesMined", "marketOrders"].includes(hash) ? hash : "netWorth";
  };
  
  // Track active category in state
  const [category, setCategory] = useState(getHashCategory());
  
  // Listen for hash changes
  useEffect(() => {
    const handleHashChange = () => {
      setCategory(getHashCategory());
    };
    
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const { data: netWorthData, isLoading: netWorthLoading } = useQuery<LeaderboardData>({
    queryKey: ["/api/leaderboards?category=netWorth"],
    enabled: category === "netWorth",
  });

  const { data: sharesMinedData, isLoading: sharesMinedLoading } = useQuery<LeaderboardData>({
    queryKey: ["/api/leaderboards?category=sharesMined"],
    enabled: category === "sharesMined",
  });

  const { data: marketOrdersData, isLoading: marketOrdersLoading } = useQuery<LeaderboardData>({
    queryKey: ["/api/leaderboards?category=marketOrders"],
    enabled: category === "marketOrders",
  });

  const handleTabChange = (value: string) => {
    window.location.hash = value;
  };

  const renderLeaderboard = (data: LeaderboardData | undefined, isLoading: boolean, valueFormatter: (value: number | string) => string) => {
    if (isLoading) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          Loading leaderboard...
        </div>
      );
    }

    if (!data || data.leaderboard.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No data available
          </CardContent>
        </Card>
      );
    }

    return (
      <>
        {/* Mobile: Card Layout */}
        <div className="sm:hidden space-y-3">
          {data.leaderboard.map((entry) => {
            const isCurrentUser = user?.id === entry.userId;
            const displayName = entry.firstName && entry.lastName 
              ? `${entry.firstName} ${entry.lastName}`
              : entry.username;

            return (
              <Card 
                key={entry.userId} 
                className={`hover-elevate ${isCurrentUser ? 'border-primary border-2' : ''}`}
                data-testid={`card-leaderboard-${entry.rank}`}
              >
                <CardContent className="p-4">
                  <Link href={`/user/${entry.userId}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="font-mono font-bold text-xl w-10 text-right">
                          #{entry.rank}
                        </span>
                        {entry.rank <= 3 && (
                          <Trophy className={`w-4 h-4 ${entry.rank === 1 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                        )}
                      </div>
                      
                      <Avatar className="w-9 h-9 flex-shrink-0">
                        <AvatarImage src={entry.profileImageUrl || undefined} />
                        <AvatarFallback>{entry.username[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className={`font-semibold text-sm truncate ${isCurrentUser ? 'text-primary' : ''}`}>
                          @{entry.username}
                        </div>
                      </div>
                      
                      <div className="text-right flex-shrink-0">
                        <div className="font-mono font-bold text-base">
                          {valueFormatter(entry.value)}
                        </div>
                      </div>
                    </div>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Desktop: Table Layout */}
        <div className="hidden sm:block overflow-x-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wide">
                Global Rankings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rank</th>
                    <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">User</th>
                    <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.map((entry) => {
                    const isCurrentUser = user?.id === entry.userId;
                    const displayName = entry.firstName && entry.lastName 
                      ? `${entry.firstName} ${entry.lastName}`
                      : entry.username;

                    return (
                      <tr
                        key={entry.userId}
                        className={`border-b hover-elevate ${isCurrentUser ? 'bg-primary/5' : ''}`}
                        data-testid={`row-leaderboard-${entry.rank}`}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-lg">
                              #{entry.rank}
                            </span>
                            {entry.rank <= 3 && (
                              <Trophy className={`w-4 h-4 ${entry.rank === 1 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <Link href={`/user/${entry.userId}`}>
                            <div className="flex items-center gap-3 hover:text-primary hover:underline cursor-pointer">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={entry.profileImageUrl || undefined} />
                                <AvatarFallback>{entry.username[0].toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-semibold">{displayName}</div>
                                <div className="text-xs text-muted-foreground">@{entry.username}</div>
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className="p-4 text-right">
                          <div className="font-mono font-bold text-xl" data-testid={`text-value-${entry.userId}`}>
                            {valueFormatter(entry.value)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-8">
          <h1 className="text-3xl font-bold mb-2">Global Leaderboards</h1>
          <p className="text-muted-foreground">See how you rank against all players</p>
        </div>

        <Tabs value={category} onValueChange={handleTabChange} className="space-y-3 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="netWorth" data-testid="tab-net-worth">
              <DollarSign className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Net Worth</span>
              <span className="sm:hidden">Worth</span>
            </TabsTrigger>
            <TabsTrigger value="sharesMined" data-testid="tab-shares-mined">
              <TrendingUp className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Shares Mined</span>
              <span className="sm:hidden">Mined</span>
            </TabsTrigger>
            <TabsTrigger value="marketOrders" data-testid="tab-market-orders">
              <ShoppingCart className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Market Orders</span>
              <span className="sm:hidden">Orders</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="netWorth">
            {renderLeaderboard(netWorthData, netWorthLoading, (value) => `$${typeof value === 'string' ? value : value.toFixed(2)}`)}
          </TabsContent>

          <TabsContent value="sharesMined">
            {renderLeaderboard(sharesMinedData, sharesMinedLoading, (value) => `${value} shares`)}
          </TabsContent>

          <TabsContent value="marketOrders">
            {renderLeaderboard(marketOrdersData, marketOrdersLoading, (value) => `${value} orders`)}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
