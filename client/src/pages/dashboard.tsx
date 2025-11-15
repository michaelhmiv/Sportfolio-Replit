import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { TrendingUp, TrendingDown, Trophy, Clock, DollarSign, Pickaxe, Calendar, Search, ChevronDown, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import type { Player, Mining, Contest, Trade, DailyGame } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DashboardData {
  user: {
    balance: string;
    portfolioValue: string;
  };
  hotPlayers: Player[];
  mining: Mining & { player?: Player; capLimit: number; sharesPerHour: number };
  contests: Contest[];
  recentTrades: (Trade & { player: Player })[];
  portfolioHistory: { date: string; value: number }[];
  topHoldings: { player: Player; quantity: number; value: string; pnl: string; pnlPercent: string }[];
}

export default function Dashboard() {
  const { toast } = useToast();
  const [showPlayerSelection, setShowPlayerSelection] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [selectedGame, setSelectedGame] = useState<DailyGame | null>(null);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // WebSocket connection for live updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      console.log('[WebSocket] Connected to live updates');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[WebSocket] Received:', message);

        // Handle different message types
        if (message.type === 'liveStats') {
          // Invalidate relevant queries to refresh data
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          queryClient.invalidateQueries({ queryKey: ['/api/games'] });
        } else if (message.type === 'portfolio') {
          queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        } else if (message.type === 'mining') {
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        } else if (message.type === 'orderBook' || message.type === 'trade') {
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        }
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected');
    };

    return () => {
      ws.close();
    };
  }, []);
  
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    refetchInterval: 10000, // Poll every 10 seconds to keep mining data fresh
  });

  // Real-time mining share projection
  const [projectedShares, setProjectedShares] = useState(0);
  
  useEffect(() => {
    if (!data?.mining) {
      setProjectedShares(0);
      return;
    }

    const calculateProjectedShares = () => {
      const mining = data.mining;
      if (!mining.playerId) {
        setProjectedShares(0);
        return;
      }

      // Guard against division by zero or undefined
      if (!mining.sharesPerHour || mining.sharesPerHour === 0) {
        setProjectedShares(mining.sharesAccumulated || 0);
        return;
      }

      // Use the same calculation logic as backend
      const now = new Date();
      const effectiveStart = mining.lastClaimedAt ? new Date(mining.lastClaimedAt) : new Date(mining.updatedAt);
      const currentElapsedMs = now.getTime() - effectiveStart.getTime();
      const totalElapsedMs = (mining.residualMs || 0) + currentElapsedMs;
      
      // Convert to shares (ms per share = 3600000ms / sharesPerHour)
      const msPerShare = (60 * 60 * 1000) / mining.sharesPerHour;
      // Clamp at zero to handle client/server clock skew
      const sharesEarned = Math.max(0, Math.floor(totalElapsedMs / msPerShare));
      
      // Add to accumulated shares and cap at limit
      const projected = Math.min(mining.sharesAccumulated + sharesEarned, mining.capLimit);
      setProjectedShares(projected);
    };

    // Calculate immediately and then every second
    calculateProjectedShares();
    const interval = setInterval(calculateProjectedShares, 1000);

    return () => clearInterval(interval);
  }, [
    data?.mining?.playerId,
    data?.mining?.updatedAt,
    data?.mining?.lastClaimedAt,
    data?.mining?.residualMs,
    data?.mining?.sharesAccumulated,
    data?.mining?.sharesPerHour,
    data?.mining?.capLimit,
  ]);

  const { data: playersData } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    enabled: showPlayerSelection,
  });

  // Filter players by search and team
  const filteredPlayers = playersData?.filter(p => {
    if (!p.isEligibleForMining) return false;
    
    const matchesSearch = searchTerm === "" || 
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTeam = selectedTeam === "all" || p.team === selectedTeam;
    
    return matchesSearch && matchesTeam;
  }) || [];

  // Get unique teams for filter
  const uniqueTeams = Array.from(
    new Set(playersData?.filter(p => p.isEligibleForMining).map(p => p.team))
  ).sort();

  // Format date as YYYY-MM-DD
  const formatDateForAPI = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Check if selected date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  // Validate date is within allowed range (7 days back to 14 days forward)
  const isDateInRange = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    const minDate = new Date(today);
    minDate.setDate(today.getDate() - 7);
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + 14);
    
    return checkDate >= minDate && checkDate <= maxDate;
  };

  // Get date range boundaries
  const getDateRange = () => {
    const today = new Date();
    const minDate = new Date(today);
    minDate.setDate(today.getDate() - 7);
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + 14);
    return { minDate, maxDate };
  };

  const formattedDate = formatDateForAPI(selectedDate);

  const { data: todayGames } = useQuery<DailyGame[]>({
    queryKey: ['/api/games', formattedDate],
    queryFn: async () => {
      const endpoint = isToday(selectedDate) 
        ? "/api/games/today" 
        : `/api/games/date/${formattedDate}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Failed to fetch games');
      return res.json();
    },
  });

  // Navigation helpers with validation
  const goToPrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    if (isDateInRange(prev)) {
      setSelectedDate(prev);
    }
  };

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    if (isDateInRange(next)) {
      setSelectedDate(next);
    }
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date && isDateInRange(date)) {
      setSelectedDate(date);
      setShowDatePicker(false);
    }
  };

  const startMiningMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const res = await apiRequest("POST", "/api/mining/start", { playerId });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setShowPlayerSelection(false);
      const playerName = data?.player?.firstName && data?.player?.lastName 
        ? `${data.player.firstName} ${data.player.lastName}`
        : "selected player";
      toast({
        title: "Mining Started!",
        description: `Now mining shares of ${playerName}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Start Mining",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const claimMiningMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mining/claim");
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      const playerName = data?.player?.firstName && data?.player?.lastName 
        ? `${data.player.firstName} ${data.player.lastName}`
        : "your player";
      toast({
        title: "Shares Claimed!",
        description: `Successfully claimed ${data.sharesClaimed || 0} shares of ${playerName}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Claim Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        {/* Market Ticker */}
        <div className="border-b bg-card">
        <div className="h-12 overflow-hidden relative">
          <div className="flex gap-6 animate-slide-left absolute whitespace-nowrap py-3 px-4">
            {data?.hotPlayers?.concat(data.hotPlayers).map((player, idx) => (
              <Link key={`${player.id}-${idx}`} href={`/player/${player.id}`}>
                <div className="inline-flex items-center gap-2 hover-elevate px-3 py-1 rounded-md">
                  <span className="font-medium">{player.firstName} {player.lastName}</span>
                  <span className="font-mono font-bold">${player.currentPrice}</span>
                  <span className={`flex items-center text-sm ${parseFloat(player.priceChange24h) >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {parseFloat(player.priceChange24h) >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    {parseFloat(player.priceChange24h) >= 0 ? '+' : ''}{player.priceChange24h}%
                  </span>
                </div>
              </Link>
            ))}
          </div>
          </div>
        </div>

        {/* Main Dashboard Grid */}
        <div className="p-3 sm:p-6 lg:p-8">
        {/* Balance Header */}
        <div className="mb-4 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-sm text-muted-foreground uppercase tracking-wide mb-1">Cash Balance</div>
                <div className="text-2xl font-mono font-bold" data-testid="text-balance">${data?.user.balance || "0.00"}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground uppercase tracking-wide mb-1">Portfolio Value</div>
                <div className="text-2xl font-mono font-bold" data-testid="text-portfolio-value">${data?.user.portfolioValue || "0.00"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Games */}
        {todayGames && todayGames.length > 0 && (
          <Card className="mb-3 sm:mb-6">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">
                {isToday(selectedDate) ? "Today's Games" : "Games"}
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPrevDay}
                  disabled={!isDateInRange(new Date(selectedDate.getTime() - 86400000))}
                  className="h-8"
                  data-testid="button-prev-day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                
                <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-2"
                      data-testid="button-open-calendar"
                    >
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm">
                        {selectedDate.toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          year: selectedDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                        })}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      disabled={(date) => !isDateInRange(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextDay}
                  disabled={!isDateInRange(new Date(selectedDate.getTime() + 86400000))}
                  className="h-8"
                  data-testid="button-next-day"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>

                {!isToday(selectedDate) && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={goToToday}
                    className="h-8"
                    data-testid="button-today"
                  >
                    Today
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Mobile: Horizontal Scroll */}
              <div className="sm:hidden">
                <ScrollArea className="w-full whitespace-nowrap">
                  <div className="flex gap-3 pb-2">
                    {todayGames.map((game) => (
                      <div
                        key={game.id}
                        className="flex-shrink-0 w-64 p-3 rounded-md bg-muted hover-elevate active-elevate-2 cursor-pointer"
                        onClick={() => setSelectedGame(game)}
                        data-testid={`game-${game.gameId}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{game.awayTeam}</span>
                            {game.status === 'completed' && game.awayScore != null && game.homeScore != null ? (
                              <span className="font-mono font-bold text-sm">{game.awayScore}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">@</span>
                            )}
                            <span className="font-medium text-sm">{game.homeTeam}</span>
                            {game.status === 'completed' && game.awayScore != null && game.homeScore != null && (
                              <span className="font-mono font-bold text-sm">{game.homeScore}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {game.status === 'scheduled' 
                              ? new Date(game.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                              : game.status === 'completed'
                              ? 'Final'
                              : 'Live'
                            }
                          </span>
                          <Badge 
                            variant={game.status === 'inprogress' ? 'default' : game.status === 'completed' ? 'secondary' : 'outline'}
                            className="text-xs"
                          >
                            {game.status === 'inprogress' ? 'LIVE' : game.status === 'completed' ? 'Final' : new Date(game.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Desktop: Grid Layout */}
              <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {todayGames.map((game) => (
                  <div
                    key={game.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => setSelectedGame(game)}
                    data-testid={`game-${game.gameId}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{game.awayTeam}</span>
                          {game.status === 'completed' && game.awayScore != null && game.homeScore != null ? (
                            <span className="font-mono font-bold text-sm">{game.awayScore}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">@</span>
                          )}
                          <span className="font-medium text-sm">{game.homeTeam}</span>
                          {game.status === 'completed' && game.awayScore != null && game.homeScore != null && (
                            <span className="font-mono font-bold text-sm">{game.homeScore}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {game.status === 'scheduled' 
                            ? new Date(game.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                            : game.status === 'completed'
                            ? 'Final'
                            : 'Live'
                          }
                        </span>
                        <Badge 
                          variant={game.status === 'inprogress' ? 'default' : game.status === 'completed' ? 'secondary' : 'outline'}
                          className="text-xs"
                        >
                          {game.status === 'inprogress' ? 'LIVE' : game.status === 'completed' ? 'Final' : new Date(game.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Widgets Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
          {/* Mining Widget */}
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">Mining</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Rate: {data?.mining?.sharesPerHour || 100} sh/hr</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {projectedShares} / {data?.mining?.capLimit || 2400}
                  </span>
                </div>
                <Progress 
                  value={(projectedShares / (data?.mining?.capLimit || 2400)) * 100} 
                  className={`h-2 transition-all ${
                    data?.mining?.player && projectedShares < (data?.mining?.capLimit || 2400)
                      ? 'animate-pulse shadow-[0_0_8px_hsl(var(--primary)_/_0.4)]'
                      : ''
                  }`}
                  data-testid="progress-mining"
                />
              </div>
              
              {data?.mining?.player ? (
                <>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold">{data.mining.player.firstName[0]}{data.mining.player.lastName[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{data.mining.player.firstName} {data.mining.player.lastName}</div>
                      <div className="text-xs text-muted-foreground">{data.mining.player.team} · {data.mining.player.position}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowPlayerSelection(true)}
                      data-testid="button-change-mining-player"
                      className="flex-shrink-0"
                    >
                      Change
                    </Button>
                  </div>
                  
                  <Button 
                    className="w-full" 
                    size="lg"
                    disabled={!projectedShares || claimMiningMutation.isPending}
                    onClick={() => claimMiningMutation.mutate()}
                    data-testid="button-claim-mining"
                  >
                    {claimMiningMutation.isPending ? "Claiming..." : `Claim ${projectedShares} Shares`}
                  </Button>
                </>
              ) : (
                <div className="text-center py-4">
                  <Pickaxe className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-4">No player selected for mining</p>
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={() => setShowPlayerSelection(true)}
                    data-testid="button-select-mining-player"
                  >
                    Select Player to Mine
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contest Summary */}
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">Contests</CardTitle>
              <Trophy className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2 sm:space-y-3">
              {data?.contests?.slice(0, 3).map((contest) => (
                <div key={contest.id} className="p-2 sm:p-3 border rounded-md hover-elevate">
                  <div className="flex items-start justify-between mb-1 sm:mb-2">
                    <div>
                      <div className="font-medium text-sm">{contest.name}</div>
                      <Badge variant="outline" className="text-xs mt-1">{contest.sport}</Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-mono font-bold text-primary">${contest.totalPrizePool}</div>
                      <div className="text-xs text-muted-foreground">{contest.entryCount} entries</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{contest.totalSharesEntered} shares entered</div>
                </div>
              ))}
              <Link href="/contests">
                <Button variant="outline" className="w-full" data-testid="button-view-contests">
                  View All Contests
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Portfolio Summary */}
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">Top Holdings</CardTitle>
              <DollarSign className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2 sm:space-y-3">
              {data?.topHoldings?.slice(0, 3).map((holding) => (
                <Link key={holding.player.id} href={`/player/${holding.player.id}`}>
                  <div className="p-2 rounded-md hover-elevate">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{holding.player.firstName} {holding.player.lastName}</span>
                      <span className="font-mono font-bold text-sm">${holding.value}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{holding.quantity} shares</span>
                      <span className={parseFloat(holding.pnl) >= 0 ? 'text-positive' : 'text-negative'}>
                        {parseFloat(holding.pnl) >= 0 ? '+' : ''}${holding.pnl} ({holding.pnlPercent}%)
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
              <Link href="/portfolio">
                <Button variant="outline" className="w-full" data-testid="button-view-portfolio">
                  View Full Portfolio
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Market Activity */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wide">Recent Market Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 sm:space-y-2">
                {data?.recentTrades?.map((trade) => (
                  <div key={trade.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-bold">{trade.player.firstName[0]}{trade.player.lastName[0]}</span>
                      </div>
                      <div>
                        <div className="font-medium text-sm">{trade.player.firstName} {trade.player.lastName}</div>
                        <div className="text-xs text-muted-foreground">{trade.player.team}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold">${trade.price}</div>
                      <div className="text-xs text-muted-foreground">{trade.quantity} shares</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </div>

      {/* Player Selection Dialog */}
      <Dialog open={showPlayerSelection} onOpenChange={setShowPlayerSelection}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Player to Mine</DialogTitle>
            <DialogDescription>
              Choose a player to start mining shares. You'll accumulate {data?.user?.balance && parseFloat(data.user.balance) > 1000 ? "200" : "100"} shares per hour up to a {data?.user?.balance && parseFloat(data.user.balance) > 1000 ? "33,600" : "2,400"} share cap.
            </DialogDescription>
          </DialogHeader>
          
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-3 px-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search players..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-players"
              />
            </div>
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger className="w-full sm:w-40" data-testid="select-team-filter">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="team-option-all">All Teams</SelectItem>
                {uniqueTeams.map((team) => (
                  <SelectItem key={team} value={team} data-testid={`team-option-${team}`}>{team}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-y-auto flex-1 px-1">
            <div className="space-y-2">
              {filteredPlayers.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  isExpanded={expandedPlayerId === player.id}
                  onToggleExpand={() => setExpandedPlayerId(
                    expandedPlayerId === player.id ? null : player.id
                  )}
                  onSelect={() => startMiningMutation.mutate(player.id)}
                  isPending={startMiningMutation.isPending}
                />
              ))}
            </div>
            {filteredPlayers.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No players found matching your criteria</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <GameStatsDialog game={selectedGame} onClose={() => setSelectedGame(null)} />
    </>
  );
}

// Player Card Component with Stats and Recent Games
function PlayerCard({ 
  player, 
  isExpanded, 
  onToggleExpand, 
  onSelect, 
  isPending 
}: { 
  player: Player; 
  isExpanded: boolean; 
  onToggleExpand: () => void; 
  onSelect: () => void; 
  isPending: boolean;
}) {
  const { data: statsData, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/player", player.id, "stats"],
    enabled: isExpanded,
  });

  const { data: recentGamesData, isLoading: gamesLoading } = useQuery<any>({
    queryKey: ["/api/player", player.id, "recent-games"],
    enabled: isExpanded,
  });

  const stats = statsData?.stats;
  const recentGames = recentGamesData?.recentGames || [];

  return (
    <Card className="hover-elevate">
      <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold">{player.firstName[0]}{player.lastName[0]}</span>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{player.firstName} {player.lastName}</div>
                  <div className="text-sm text-muted-foreground">{player.team} · {player.position}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-mono font-bold">${player.currentPrice}</div>
                </div>
              </div>
              
              {/* Season Averages */}
              {stats && !statsLoading ? (
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                  <span className="font-mono"><span className="font-bold">{stats.pointsPerGame || "0.0"}</span> PPG</span>
                  <span className="font-mono"><span className="font-bold">{stats.reboundsPerGame || "0.0"}</span> RPG</span>
                  <span className="font-mono"><span className="font-bold">{stats.assistsPerGame || "0.0"}</span> APG</span>
                  <span className="text-muted-foreground/60">·</span>
                  <span>{stats.gamesPlayed || 0} GP</span>
                </div>
              ) : isExpanded && statsLoading ? (
                <div className="text-xs text-muted-foreground mt-2">Loading stats...</div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 flex-shrink-0">
              <CollapsibleTrigger asChild>
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  data-testid={`button-expand-player-${player.id}`}
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                disabled={isPending}
                data-testid={`button-select-player-${player.id}`}
                className="whitespace-nowrap"
              >
                {isPending ? "..." : "Mine"}
              </Button>
            </div>
          </div>

          <CollapsibleContent>
            {isExpanded && (
              <div className="mt-4 pt-4 border-t space-y-3">
                {/* Full Season Stats */}
                {stats && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Season Stats
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 rounded-md bg-muted/50">
                        <div className="text-xs text-muted-foreground">FG%</div>
                        <div className="font-mono font-bold">{stats.fieldGoalPct || "0.0"}%</div>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/50">
                        <div className="text-xs text-muted-foreground">3P%</div>
                        <div className="font-mono font-bold">{stats.threePointPct || "0.0"}%</div>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/50">
                        <div className="text-xs text-muted-foreground">FT%</div>
                        <div className="font-mono font-bold">{stats.freeThrowPct || "0.0"}%</div>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/50">
                        <div className="text-xs text-muted-foreground">STL</div>
                        <div className="font-mono font-bold">{stats.steals || 0}</div>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/50">
                        <div className="text-xs text-muted-foreground">BLK</div>
                        <div className="font-mono font-bold">{stats.blocks || 0}</div>
                      </div>
                      <div className="text-center p-2 rounded-md bg-muted/50">
                        <div className="text-xs text-muted-foreground">MPG</div>
                        <div className="font-mono font-bold">{stats.minutesPerGame || "0.0"}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Last 5 Games */}
                {recentGames.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Last 5 Games
                    </div>
                    <div className="space-y-2">
                      {recentGames.map((game: any, idx: number) => (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium w-12">{game.game?.isHome ? 'vs' : '@'} {game.game?.opponent || "UNK"}</span>
                            <span className="text-muted-foreground">
                              {game.game?.date ? new Date(game.game.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : "N/A"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 font-mono">
                            <span className="font-bold">{game.stats?.points || 0} PTS</span>
                            <span className="text-muted-foreground">{game.stats?.rebounds || 0} REB</span>
                            <span className="text-muted-foreground">{game.stats?.assists || 0} AST</span>
                            <span className="text-muted-foreground text-[10px]">
                              {game.stats?.fieldGoalsMade || 0}/{game.stats?.fieldGoalsAttempted || 0} FG
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {gamesLoading && (
                  <div className="text-xs text-center text-muted-foreground py-4">
                    Loading recent games...
                  </div>
                )}
                
                {!gamesLoading && recentGames.length === 0 && isExpanded && (
                  <div className="text-xs text-center text-muted-foreground py-4">
                    No recent games available
                  </div>
                )}
              </div>
            )}
          </CollapsibleContent>
        </div>
        </Collapsible>
      </Card>
  );
}

// Game Stats Dialog Component
function GameStatsDialog({ game, onClose }: { game: DailyGame | null; onClose: () => void }) {
  if (!game) return null;
  
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {game.awayTeam} @ {game.homeTeam}
          </DialogTitle>
          <DialogDescription>
            {new Date(game.startTime).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at {new Date(game.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <h3 className="text-lg font-semibold mb-2">{game.awayTeam}</h3>
            </div>
            <div className="flex items-center justify-center">
              <div className="text-sm text-muted-foreground">
                {game.status === "inprogress" && <Badge variant="destructive">Live</Badge>}
                {game.status === "scheduled" && <Badge variant="secondary">Scheduled</Badge>}
                {game.status === "completed" && <Badge variant="outline">Final</Badge>}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">{game.homeTeam}</h3>
            </div>
          </div>
          <div className="text-center text-sm text-muted-foreground">
            {game.venue && <div className="mb-2">{game.venue}</div>}
            Detailed game stats and scores coming soon...
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
