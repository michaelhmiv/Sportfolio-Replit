import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWebSocket } from "@/lib/websocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trophy, TrendingUp, Activity, Award, DollarSign, Clock, Edit2, Settings, Moon, Sun } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Player } from "@shared/schema";
import { PlayerName } from "@/components/player-name";
import { EmptyState } from "@/components/ui/empty-state";

interface UserProfile {
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
    isAdmin: boolean;
    isPremium: boolean;
    createdAt: string;
  };
  stats: {
    netWorth: string;
    totalSharesVested: number;
    totalMarketOrders: number;
    totalTradesExecuted: number;
    holdingsCount: number;
  };
  rankings: {
    sharesVested: number;
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
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const { subscribe } = useWebSocket();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    const initialTheme = stored || "dark";
    setTheme(initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: [`/api/user/${userId}/profile`],
  });

  // WebSocket listener for real-time profile updates
  useEffect(() => {
    if (!userId) return;

    // Subscribe to portfolio events (trades, balance changes)
    const unsubPortfolio = subscribe('portfolio', (data) => {
      if (data.userId === userId) {
        queryClient.invalidateQueries({ queryKey: [`/api/user/${userId}/profile`] });
      }
    });

    // Subscribe to vesting events
    const unsubVesting = subscribe('vesting', (data) => {
      if (data.userId === userId) {
        queryClient.invalidateQueries({ queryKey: [`/api/user/${userId}/profile`] });
      }
    });

    // Subscribe to trade events (affects market orders count and net worth)
    const unsubTrade = subscribe('trade', () => {
      queryClient.invalidateQueries({ queryKey: [`/api/user/${userId}/profile`] });
    });

    return () => {
      unsubPortfolio();
      unsubVesting();
      unsubTrade();
    };
  }, [userId, subscribe]);

  const updateUsernameMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await apiRequest("POST", `/api/user/update-username`, { username });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/user/${userId}/profile`] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setIsEditDialogOpen(false);
      toast({
        title: "Username updated",
        description: "Your username has been successfully changed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update username",
        variant: "destructive",
      });
    },
  });

  const handleUpdateUsername = () => {
    if (newUsername.trim()) {
      updateUsernameMutation.mutate(newUsername.trim());
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-3 sm:p-4 flex items-center justify-center">
        <div className="text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background p-3 sm:p-4 flex items-center justify-center">
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-muted-foreground">User not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { user, stats, rankings, holdings } = profile;
  const displayName = user.username;
  const initials = user.username.slice(0, 2).toUpperCase();
  const memberSince = new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const isOwnProfile = currentUser?.id === user.id;

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-3">
        {/* Profile Header */}
        <Card data-testid="card-profile-header">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <Avatar className="h-20 w-20 sm:h-24 sm:w-24" data-testid="avatar-user">
                <AvatarImage src={user.profileImageUrl} alt={displayName} />
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-username">@{displayName}</h1>
                  {user.isPremium && (
                    <Badge variant="default" className="gap-1">
                      <Trophy className="w-3 h-3" />
                      Premium
                    </Badge>
                  )}
                  {isOwnProfile && (
                    <>
                      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2" data-testid="button-edit-username">
                            <Edit2 className="w-3 h-3" />
                            Edit Username
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Change Username</DialogTitle>
                            <DialogDescription>
                              Choose a unique username (3-20 characters, letters, numbers, underscores, and hyphens only)
                            </DialogDescription>
                          </DialogHeader>
                          <div className="py-4">
                            <Input
                              placeholder="Enter new username"
                              value={newUsername}
                              onChange={(e) => setNewUsername(e.target.value)}
                              maxLength={20}
                              data-testid="input-new-username"
                            />
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button
                              onClick={handleUpdateUsername}
                              disabled={updateUsernameMutation.isPending || !newUsername.trim()}
                              data-testid="button-save-username"
                            >
                              {updateUsernameMutation.isPending ? "Saving..." : "Save"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={toggleTheme}
                        data-testid="button-theme-toggle"
                      >
                        {theme === "light" ? (
                          <Moon className="w-3 h-3" />
                        ) : (
                          <Sun className="w-3 h-3" />
                        )}
                        {theme === "light" ? "Dark Mode" : "Light Mode"}
                      </Button>
                      {profile.user.isAdmin && (
                        <Link href="/admin">
                          <Button variant="outline" size="sm" className="gap-2" data-testid="button-admin">
                            <Settings className="w-3 h-3" />
                            Admin
                          </Button>
                        </Link>
                      )}
                    </>
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
          <Link href="/leaderboards#netWorth">
            <Card className="hover-elevate cursor-pointer" data-testid="card-net-worth">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-positive" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Net Worth</span>
                </div>
                <div className="font-mono text-lg sm:text-2xl font-bold text-positive" data-testid="text-net-worth">
                  ${stats.netWorth}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Rank #{rankings.netWorth} → View Full Board
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/leaderboards#sharesVested">
            <Card className="hover-elevate cursor-pointer" data-testid="card-shares-mined">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-4 h-4 text-primary" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Shares Vested</span>
                </div>
                <div className="text-lg sm:text-2xl font-bold" data-testid="text-shares-mined">
                  {stats.totalSharesVested?.toLocaleString() ?? "0"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Rank #{rankings.sharesVested ?? "?"} → View Full Board
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/leaderboards#marketOrders">
            <Card className="hover-elevate cursor-pointer" data-testid="card-market-orders">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Market Orders</span>
                </div>
                <div className="text-lg sm:text-2xl font-bold" data-testid="text-market-orders">
                  {stats.totalMarketOrders.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Rank #{rankings.marketOrders} → View Full Board
                </div>
              </CardContent>
            </Card>
          </Link>

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
              <EmptyState
                icon="wallet"
                title="No holdings yet"
                description="This user hasn't built a portfolio yet."
                size="sm"
                className="py-4"
                data-testid="empty-user-holdings"
              />
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
                              <PlayerName
                                playerId={player.id}
                                firstName={player.firstName}
                                lastName={player.lastName}
                              />
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
