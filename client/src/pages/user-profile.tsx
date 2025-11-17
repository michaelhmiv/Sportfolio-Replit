import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, TrendingUp, Activity, Award, DollarSign, Clock } from "lucide-react";
import { Link } from "wouter";
import type { Player } from "@shared/schema";

interface UserProfile {
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
    isPremium: boolean;
    createdAt: string;
  };
  stats: {
    netWorth: string;
    totalSharesMined: number;
    totalMarketOrders: number;
    totalTradesExecuted: number;
    holdingsCount: number;
  };
  rankings: {
    sharesMined: number;
    marketOrders: number;
    netWorth: number;
  };
  holdings: Array<{
    id: string;
    assetId: string;
    quantity: number;
    player?: Player;
    lastTradePrice?: string;
    marketValue?: string;
  }>;
}

export default function UserProfile() {
  const params = useParams();
  const userId = params.id;

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: [`/api/user/${userId}/profile`],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-3 sm:p-6 lg:p-8 flex items-center justify-center">
        <div className="text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background p-3 sm:p-6 lg:p-8 flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">User not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { user, stats, rankings, holdings } = profile;
  const displayName = user.username || `${user.firstName} ${user.lastName}` || "Unknown User";
  const initials = (user.firstName?.[0] || "") + (user.lastName?.[0] || "");
  const memberSince = new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Profile Header */}
        <Card data-testid="card-profile-header">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Avatar className="h-20 w-20 sm:h-24 sm:w-24" data-testid="avatar-user">
                <AvatarImage src={user.profileImageUrl} alt={displayName} />
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-username">{displayName}</h1>
                  {user.isPremium && (
                    <Badge variant="default" className="gap-1">
                      <Trophy className="w-3 h-3" />
                      Premium
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  Member since {memberSince}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="hover-elevate" data-testid="card-net-worth">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-positive" />
                <span className="text-xs sm:text-sm text-muted-foreground">Net Worth</span>
              </div>
              <div className="font-mono text-lg sm:text-2xl font-bold text-positive" data-testid="text-net-worth">
                ${stats.netWorth}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Rank #{rankings.netWorth}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate" data-testid="card-shares-mined">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-4 h-4 text-primary" />
                <span className="text-xs sm:text-sm text-muted-foreground">Shares Mined</span>
              </div>
              <div className="text-lg sm:text-2xl font-bold" data-testid="text-shares-mined">
                {stats.totalSharesMined.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Rank #{rankings.sharesMined}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate" data-testid="card-market-orders">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-xs sm:text-sm text-muted-foreground">Market Orders</span>
              </div>
              <div className="text-lg sm:text-2xl font-bold" data-testid="text-market-orders">
                {stats.totalMarketOrders.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Rank #{rankings.marketOrders}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate" data-testid="card-trades-executed">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-xs sm:text-sm text-muted-foreground">Trades</span>
              </div>
              <div className="text-lg sm:text-2xl font-bold" data-testid="text-trades-executed">
                {stats.totalTradesExecuted.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {stats.holdingsCount} holdings
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Holdings */}
        <Card data-testid="card-holdings">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Public Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            {holdings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No public holdings to display
              </div>
            ) : (
              <div className="space-y-2">
                {holdings.map((holding) => {
                  const player = holding.player;
                  if (!player) return null;

                  return (
                    <Link key={holding.id} href={`/player/${holding.assetId}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg hover-elevate border" data-testid={`holding-${holding.assetId}`}>
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="font-semibold">
                              {player.firstName} {player.lastName}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {player.team} • {player.position}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="font-semibold" data-testid={`text-quantity-${holding.assetId}`}>
                            {holding.quantity} shares
                          </div>
                          {holding.marketValue && (
                            <div className="text-sm font-mono text-muted-foreground">
                              ${holding.marketValue}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
