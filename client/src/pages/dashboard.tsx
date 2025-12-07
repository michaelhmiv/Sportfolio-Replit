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
import { TrendingUp, TrendingDown, Trophy, Clock, DollarSign, Calendar, Search, ChevronDown, BarChart3, ChevronLeft, ChevronRight, ExternalLink, ArrowUpDown, LogIn, Activity } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Player, Vesting, Contest, Trade, DailyGame } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { invalidatePortfolioQueries } from "@/lib/cache-invalidation";
import { calculateVestingShares } from "@shared/vesting-utils";
import { MarketActivityWidget } from "@/components/market-activity-widget";
import { PlayerName } from "@/components/player-name";
import { AdSenseAd } from "@/components/adsense-ad";
import { Shimmer, ShimmerCard, ScrollReveal, AnimatedButton, SwipeHint } from "@/components/ui/animations";
import { AnimatedPrice } from "@/components/ui/animated-price";

interface DashboardData {
  user: {
    balance: string;
    portfolioValue: string;
    cashRank: number;
    portfolioRank: number;
    cashRankChange: number | null;
    portfolioRankChange: number | null;
  } | null; // Null for non-authenticated users
  hotPlayers: Player[];
  vesting: (Vesting & { 
    player?: Player; 
    players?: Array<{ player: Player | undefined; sharesPerHour: number }>;
    capLimit: number; 
    sharesPerHour: number; 
  }) | null; // Null for non-authenticated users
  contests: Contest[];
  recentTrades: (Trade & { player: Player })[];
  portfolioHistory: { date: string; value: number }[];
  topHoldings: { player: Player; quantity: number; value: string; pnl: string; pnlPercent: string }[];
}

// Helper to determine effective game status based on current time
const getEffectiveGameStatus = (game: DailyGame): string => {
  const now = new Date();
  const startTime = new Date(game.startTime);
  const timeSinceStart = now.getTime() - startTime.getTime();
  const threeHoursInMs = 3 * 60 * 60 * 1000;
  
  // If DB says completed, trust it
  if (game.status === 'completed') {
    return 'completed';
  }
  
  // If DB says inprogress, trust it
  if (game.status === 'inprogress') {
    return 'inprogress';
  }
  
  // If game is scheduled but should have started (and it's been less than 3 hours), assume it's live
  if (game.status === 'scheduled' && timeSinceStart > 0 && timeSinceStart < threeHoursInMs) {
    return 'inprogress';
  }
  
  // If more than 3 hours have passed since start and still scheduled, likely completed but not synced
  if (game.status === 'scheduled' && timeSinceStart >= threeHoursInMs) {
    return 'completed';
  }
  
  return game.status;
};

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [showPlayerSelection, setShowPlayerSelection] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [flippedGameId, setFlippedGameId] = useState<string | null>(null);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [sortField, setSortField] = useState<'name' | 'fantasyPoints' | 'marketValue'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Debounce search input (250ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 250);
    
    return () => clearTimeout(timer);
  }, [searchTerm]);
  
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    queryFn: async () => {
      // Add 10-second timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 10000);
      
      try {
        const res = await fetch("/api/dashboard", {
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          throw new Error(`${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('Dashboard request timed out after 10 seconds');
        }
        throw err;
      }
    },
    refetchInterval: 10000,
  });

  // Real-time vesting share projection
  const [projectedShares, setProjectedShares] = useState(0);
  
  useEffect(() => {
    if (!data?.vesting) {
      setProjectedShares(0);
      return;
    }

    const calculateProjectedShares = () => {
      const vesting = data.vesting;
      if (!vesting) {
        setProjectedShares(0);
        return;
      }

      const usingSplits = vesting.players && vesting.players.length > 0;
      
      // If using splits or single player mode, check if configured
      if (!usingSplits && !vesting.playerId) {
        setProjectedShares(0);
        return;
      }

      // Calculate total shares per hour (from splits or single player)
      let totalSharesPerHour = 0;
      if (usingSplits && vesting.players) {
        // Sum individual player rates for multi-player vesting
        totalSharesPerHour = vesting.players.reduce((sum, p) => sum + (p.sharesPerHour || 0), 0);
      } else {
        // Use single player rate for legacy vesting
        totalSharesPerHour = vesting.sharesPerHour || 0;
      }

      // Guard against missing required fields
      if (!totalSharesPerHour || totalSharesPerHour === 0 || !vesting.lastAccruedAt) {
        setProjectedShares(vesting.sharesAccumulated || 0);
        return;
      }

      // Use shared utility to ensure frontend matches backend calculation exactly
      const result = calculateVestingShares({
        sharesAccumulated: vesting.sharesAccumulated || 0,
        residualMs: vesting.residualMs || 0,
        lastAccruedAt: vesting.lastAccruedAt,
        sharesPerHour: totalSharesPerHour,
        capLimit: vesting.capLimit || 2400,
      });

      setProjectedShares(result.projectedShares);
    };

    // Calculate immediately and then every second
    calculateProjectedShares();
    const interval = setInterval(calculateProjectedShares, 1000);

    return () => clearInterval(interval);
  }, [
    data?.vesting?.playerId,
    data?.vesting?.lastAccruedAt,
    data?.vesting?.residualMs,
    data?.vesting?.sharesAccumulated,
    data?.vesting?.sharesPerHour,
    data?.vesting?.capLimit,
    data?.vesting?.players,
  ]);

  // Handle Escape key and click-outside to close flipped card
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && flippedGameId) {
        setFlippedGameId(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (flippedGameId) {
        const target = e.target as HTMLElement;
        // Don't close if clicking on the flipped card or its children
        if (!target.closest('[data-game-card-id="' + flippedGameId + '"]')) {
          setFlippedGameId(null);
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [flippedGameId]);

  const { data: playersResponse } = useQuery<{ players: Player[], total: number }>({
    queryKey: ["/api/players", debouncedSearchTerm, selectedTeam],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);
      if (selectedTeam && selectedTeam !== "all") params.append("team", selectedTeam);
      // Only show vesting-eligible players
      params.append("limit", "1000"); // Load all eligible players for vesting selection
      
      const url = `/api/players?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch players");
      const data = await res.json();
      return data;
    },
    enabled: showPlayerSelection,
  });

  const playersData = playersResponse?.players;

  // Filter only for vesting eligibility (server-side handles search and team filter)
  const eligiblePlayers = playersData?.filter(p => p.isEligibleForMining) || [];
  
  // Sort players based on selected criteria
  const filteredPlayers = [...eligiblePlayers].sort((a, b) => {
    let comparison = 0;
    
    if (sortField === 'name') {
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      comparison = nameA.localeCompare(nameB);
    } else if (sortField === 'fantasyPoints') {
      const fpgA = parseFloat((a as any).avgFantasyPointsPerGame || '0');
      const fpgB = parseFloat((b as any).avgFantasyPointsPerGame || '0');
      comparison = fpgA - fpgB; // Ascending order (low to high)
    } else if (sortField === 'marketValue') {
      const mvA = parseFloat(a.lastTradePrice || '0');
      const mvB = parseFloat(b.lastTradePrice || '0');
      comparison = mvA - mvB; // Ascending order (low to high)
    }
    
    // For desc, reverse the comparison (high to low)
    return sortDirection === 'desc' ? -comparison : comparison;
  });

  // Get unique teams for filter
  const { data: teams } = useQuery<string[]>({
    queryKey: ["/api/teams"],
  });
  const uniqueTeams = teams || [];

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

  const startVestingMutation = useMutation({
    mutationFn: async (playerIds: string[]) => {
      const res = await apiRequest("POST", "/api/vesting/start", { playerIds });
      const data = await res.json();
      // Don't await cache invalidation - let it run in background for instant UI response
      return data;
    },
    onSuccess: (data: any) => {
      // Invalidate cache in background (non-blocking)
      invalidatePortfolioQueries();
      
      // Close dialog immediately for responsive UX
      setShowPlayerSelection(false);
      setSelectedPlayers([]);
      
      const playerCount = data?.players?.length || 0;
      const claimed = data?.claimed;
      
      if (claimed) {
        // Shares were auto-claimed during switch
        if (claimed.players && claimed.players.length > 0) {
          // Multi-player claim
          const playerBreakdown = claimed.players
            .map((p: any) => `${p.playerName} (${p.sharesClaimed})`)
            .join(", ");
          toast({
            title: "Vesting Updated!",
            description: `Auto-claimed ${claimed.totalSharesClaimed} shares (${playerBreakdown}). Now vesting ${playerCount} player${playerCount !== 1 ? 's' : ''}.`,
          });
        } else if (claimed.player) {
          // Single-player claim
          const playerName = `${claimed.player.firstName} ${claimed.player.lastName}`;
          toast({
            title: "Vesting Updated!",
            description: `Auto-claimed ${claimed.sharesClaimed} shares of ${playerName}. Now vesting ${playerCount} player${playerCount !== 1 ? 's' : ''}.`,
          });
        } else {
          // Generic auto-claim message
          toast({
            title: "Vesting Updated!",
            description: `Auto-claimed pending shares and started vesting ${playerCount} player${playerCount !== 1 ? 's' : ''}.`,
          });
        }
      } else {
        // No auto-claim needed
        toast({
          title: "Vesting Started!",
          description: `Now vesting shares of ${playerCount} player${playerCount !== 1 ? 's' : ''}`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Start Vesting",
        description: error.error || error.message,
        variant: "destructive",
      });
    },
  });

  const claimVestingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/vesting/claim");
      const data = await res.json();
      // Don't await cache invalidation - let it run in background for instant UI response
      return data;
    },
    onSuccess: (data: any) => {
      // Invalidate cache in background (non-blocking)
      invalidatePortfolioQueries();
      
      // Multi-player vesting response
      if (data?.players && data.players.length > 0) {
        const playerBreakdown = data.players
          .map((p: any) => `${p.playerName} (${p.sharesClaimed})`)
          .join(", ");
        toast({
          title: `Claimed ${data.totalSharesClaimed} Shares!`,
          description: `Distribution: ${playerBreakdown}`,
        });
      } else {
        // Single player vesting response
        const sharesClaimed = data?.sharesClaimed || 0;
        const playerName = data?.player?.firstName && data?.player?.lastName 
          ? `${data.player.firstName} ${data.player.lastName}`
          : "your player";
        toast({
          title: "Shares Claimed!",
          description: `Successfully claimed ${sharesClaimed} shares of ${playerName}`,
        });
      }
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
      <div className="min-h-screen bg-background p-3 sm:p-4">
        <div className="mb-4">
          <div className="flex flex-row justify-between gap-3">
            <div className="flex-1">
              <Shimmer height="14px" width="80px" className="mb-2" />
              <Shimmer height="32px" width="120px" />
            </div>
            <div className="flex-1 flex flex-col items-end">
              <Shimmer height="14px" width="100px" className="mb-2" />
              <Shimmer height="32px" width="140px" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="lg:col-span-2 space-y-3">
            <ShimmerCard lines={4} />
            <ShimmerCard lines={6} />
          </div>
          <div className="space-y-3">
            <ShimmerCard lines={3} />
            <ShimmerCard lines={5} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background overflow-x-hidden max-w-full">
        {/* Login Banner for Non-Authenticated Users */}
        {!isAuthenticated && (
          <div className="bg-primary text-primary-foreground border-b border-primary/20">
            <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm sm:text-base">
                <LogIn className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium">
                  See live NBA trading in action. <span className="hidden sm:inline">Sign in to start trading, vesting, and competing.</span>
                </span>
              </div>
              <Button 
                variant="secondary" 
                size="sm" 
                asChild 
                className="flex-shrink-0"
                data-testid="button-banner-login"
              >
                <a href="/api/login" className="flex items-center gap-2">
                  Sign In
                  <LogIn className="w-3 h-3" />
                </a>
              </Button>
            </div>
          </div>
        )}
        
        {/* Market Activity Ticker */}
        {data && data.recentTrades && data.recentTrades.length > 0 && (
          <div className="border-b bg-card/80 backdrop-blur-sm overflow-x-hidden relative">
            {/* Gradient fade edges */}
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-card to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-card to-transparent z-10 pointer-events-none" />
            
            <div className="h-12 overflow-hidden relative">
              <div className="flex gap-4 animate-ticker absolute whitespace-nowrap py-3 px-4">
                {data.recentTrades.concat(data.recentTrades).concat(data.recentTrades).map((trade, idx) => (
                  <div 
                    key={`${trade.id}-${idx}`} 
                    className="inline-flex items-center gap-2 hover-elevate px-3 py-1 rounded-md transition-all duration-200 group"
                  >
                    <span className="text-primary font-bold text-sm group-hover:scale-110 transition-transform">
                      <Activity className="w-3 h-3" />
                    </span>
                    <span className="font-medium text-xs sm:text-sm">
                      <PlayerName 
                        playerId={trade.player.id} 
                        firstName={trade.player.firstName} 
                        lastName={trade.player.lastName}
                      />
                    </span>
                    <span className="font-mono font-bold text-xs sm:text-sm text-primary">${trade.price}</span>
                    <span className="text-muted-foreground text-xs">{trade.quantity} sh</span>
                    <span className="text-muted-foreground/50 text-xs">|</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Dashboard Grid */}
        <div className="p-3 sm:p-4 max-w-full overflow-x-hidden">
        {/* Balance Header - Only show for authenticated users */}
        {isAuthenticated && data?.user && (
          <div className="mb-4 sm:mb-4">
            <div className="flex flex-row justify-between gap-3">
              <div>
                <div className="text-sm text-muted-foreground uppercase tracking-wide mb-1">Cash Balance</div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-mono font-bold" data-testid="text-balance">${data?.user?.balance || "0.00"}</div>
                  {data?.user?.cashRank && data?.user.cashRank > 0 && (
                    <button
                      onClick={() => setLocation("/leaderboards#cashBalance")}
                      className="inline-flex items-center gap-1 border border-border px-2 py-0.5 rounded-md text-xs hover-elevate active-elevate-2 transition-colors cursor-pointer"
                      data-testid="badge-cash-rank"
                      aria-label={`Cash balance rank #${data?.user.cashRank}, click to view leaderboard`}
                    >
                      #{data?.user.cashRank}
                      {data?.user.cashRankChange !== null && data?.user.cashRankChange !== 0 && (
                        <span className={data?.user.cashRankChange > 0 ? "text-positive" : "text-negative"}>
                          {data?.user.cashRankChange > 0 ? (
                            <TrendingUp className="w-3 h-3 inline" />
                          ) : (
                            <TrendingDown className="w-3 h-3 inline" />
                          )}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground uppercase tracking-wide mb-1">Portfolio Value</div>
                <div className="flex items-center gap-2 justify-end">
                  {data?.user?.portfolioRank && data?.user.portfolioRank > 0 && (
                    <button
                      onClick={() => setLocation("/leaderboards#portfolioValue")}
                      className="inline-flex items-center gap-1 border border-border px-2 py-0.5 rounded-md text-xs hover-elevate active-elevate-2 transition-colors cursor-pointer"
                      data-testid="badge-portfolio-rank"
                      aria-label={`Portfolio value rank #${data?.user.portfolioRank}, click to view leaderboard`}
                    >
                      #{data?.user.portfolioRank}
                      {data?.user.portfolioRankChange !== null && data?.user.portfolioRankChange !== 0 && (
                        <span className={data?.user.portfolioRankChange > 0 ? "text-positive" : "text-negative"}>
                          {data?.user.portfolioRankChange > 0 ? (
                            <TrendingUp className="w-3 h-3 inline" />
                          ) : (
                            <TrendingDown className="w-3 h-3 inline" />
                          )}
                        </span>
                      )}
                    </button>
                  )}
                  <div className="text-2xl font-mono font-bold" data-testid="text-portfolio-value">${data?.user?.portfolioValue || "0.00"}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Games */}
        {todayGames && (
          <ScrollReveal delay={0.1}>
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
              {todayGames.length > 0 ? (
              <div className="overflow-x-auto -mx-2 px-2 relative">
                <div className="grid grid-rows-2 grid-flow-col auto-cols-[minmax(140px,1fr)] gap-2">
                  {todayGames.map((game) => {
                    const effectiveStatus = getEffectiveGameStatus(game);
                    const isFlipped = flippedGameId === game.id;
                    const plainTextSportsUrl = getPlainTextSportsUrl(game);
                    
                    return (
                      <div
                        key={game.id}
                        data-game-card-id={game.id}
                        className="relative cursor-pointer"
                        style={{ 
                          perspective: '1000px',
                          minHeight: '80px'
                        }}
                        data-testid={`game-${game.gameId}`}
                      >
                        {/* Flip Container */}
                        <div
                          className="relative w-full h-full transition-transform duration-500"
                          style={{
                            transformStyle: 'preserve-3d',
                            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                          }}
                        >
                          {/* Front Face */}
                          <div
                            className="absolute inset-0 p-2 rounded-md bg-muted hover-elevate active-elevate-2"
                            style={{
                              backfaceVisibility: 'hidden',
                              WebkitBackfaceVisibility: 'hidden',
                            }}
                            onClick={() => setFlippedGameId(game.id)}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-xs">{game.awayTeam}</span>
                                {(effectiveStatus === 'completed' || effectiveStatus === 'inprogress') && game.awayScore != null && (
                                  <span className="font-mono font-bold text-xs">{game.awayScore}</span>
                                )}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-xs">{game.homeTeam}</span>
                                {(effectiveStatus === 'completed' || effectiveStatus === 'inprogress') && game.homeScore != null && (
                                  <span className="font-mono font-bold text-xs">{game.homeScore}</span>
                                )}
                              </div>
                              <div className="flex items-center justify-between text-xs mt-0.5">
                                <span className="text-muted-foreground text-[10px]">
                                  {effectiveStatus === 'scheduled' 
                                    ? new Date(game.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                                    : effectiveStatus === 'completed'
                                    ? 'Final'
                                    : 'Live'
                                  }
                                </span>
                                <Badge 
                                  variant={effectiveStatus === 'inprogress' ? 'default' : effectiveStatus === 'completed' ? 'secondary' : 'outline'}
                                  className="text-[10px] h-4 px-1"
                                >
                                  {effectiveStatus === 'inprogress' ? 'LIVE' : effectiveStatus === 'completed' ? 'Final' : new Date(game.startTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          {/* Back Face */}
                          <div
                            className="absolute inset-0 p-2 rounded-md bg-muted"
                            style={{
                              backfaceVisibility: 'hidden',
                              WebkitBackfaceVisibility: 'hidden',
                              transform: 'rotateY(180deg)',
                            }}
                          >
                            <div className="flex flex-col gap-2 h-full justify-center">
                              <div className="text-center">
                                <div className="text-xs font-semibold mb-1">
                                  {game.awayTeam} @ {game.homeTeam}
                                </div>
                                <div className="text-[10px] text-muted-foreground mb-2">
                                  {new Date(game.startTime).toLocaleDateString([], { 
                                    month: 'short', 
                                    day: 'numeric' 
                                  })}
                                </div>
                              </div>
                              <Button
                                variant="default"
                                size="sm"
                                className="text-[10px] h-7 px-2"
                                asChild
                                data-testid={`button-live-stats-${game.gameId}`}
                              >
                                <a 
                                  href={plainTextSportsUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Live Game Stats
                                </a>
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Mobile swipe hint */}
                <SwipeHint 
                  direction="both" 
                  className="mt-2 sm:hidden" 
                  show={todayGames.length > 3} 
                />
              </div>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  ⊡ No games scheduled for this date
                </div>
              )}
            </CardContent>
          </Card>
          </ScrollReveal>
        )}

        {/* Widgets Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3">
          {/* Vesting Widget */}
          <ScrollReveal delay={0.15}>
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">Vesting</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              {!isAuthenticated ? (
                <div className="text-center py-6">
                  <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-4">Earn shares automatically over time</p>
                  <Button 
                    className="w-full" 
                    size="lg"
                    asChild
                    data-testid="button-login-vesting"
                  >
                    <a href="/api/login" className="flex items-center justify-center gap-2">
                      <LogIn className="w-4 h-4" />
                      Sign In to Start Vesting
                    </a>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Rate: {data?.vesting?.sharesPerHour || 100} sh/hr</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {projectedShares} / {data?.vesting?.capLimit || 2400}
                      </span>
                    </div>
                    <Progress 
                      value={(projectedShares / (data?.vesting?.capLimit || 2400)) * 100} 
                      className={`h-2 transition-all ${
                        data?.vesting?.player && projectedShares < (data?.vesting?.capLimit || 2400)
                          ? 'animate-pulse shadow-[0_0_8px_hsl(var(--primary)_/_0.4)]'
                          : ''
                      }`}
                      data-testid="progress-vesting"
                    />
                  </div>
                  
                  {data?.vesting?.players && data.vesting.players.length > 0 ? (
                    <>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {data.vesting.players.map((entry, idx) => entry.player && (
                          <div key={entry.player.id} className="flex items-center gap-2 p-1.5 rounded-md bg-muted text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">
                                <PlayerName 
                                  playerId={entry.player.id} 
                                  firstName={entry.player.firstName} 
                                  lastName={entry.player.lastName}
                                  className="text-xs"
                                />
                              </div>
                              <div className="text-[10px] text-muted-foreground">{entry.sharesPerHour} sh/hr</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowPlayerSelection(true)}
                          data-testid="button-change-vesting-players"
                          className="flex-1"
                        >
                          Change
                        </Button>
                        <AnimatedButton 
                          className="flex-1" 
                          size="sm"
                          disabled={!projectedShares}
                          isLoading={claimVestingMutation.isPending}
                          isSuccess={claimVestingMutation.isSuccess}
                          loadingText="Claiming..."
                          successText="Claimed!"
                          onClick={() => claimVestingMutation.mutate()}
                          data-testid="button-claim-vesting"
                        >
                          Claim {projectedShares}
                        </AnimatedButton>
                      </div>
                    </>
                  ) : data?.vesting?.player ? (
                    <>
                      <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{data.vesting.player.firstName} {data.vesting.player.lastName}</div>
                          <div className="text-xs text-muted-foreground">{data.vesting.player.team} · {data.vesting.player.position}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowPlayerSelection(true)}
                          data-testid="button-change-vesting-player"
                          className="flex-shrink-0"
                        >
                          Change
                        </Button>
                      </div>
                      
                      <AnimatedButton 
                        className="w-full" 
                        size="lg"
                        disabled={!projectedShares}
                        isLoading={claimVestingMutation.isPending}
                        isSuccess={claimVestingMutation.isSuccess}
                        loadingText="Claiming..."
                        successText="Claimed!"
                        onClick={() => claimVestingMutation.mutate()}
                        data-testid="button-claim-vesting"
                      >
                        Claim {projectedShares} Shares
                      </AnimatedButton>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-4">No players selected for vesting</p>
                      <Button 
                        className="w-full" 
                        size="lg"
                        onClick={() => setShowPlayerSelection(true)}
                        data-testid="button-select-vesting-player"
                      >
                        Select Players to Vest
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          </ScrollReveal>

          {/* Market Activity */}
          <ScrollReveal delay={0.25}>
          <MarketActivityWidget />
          </ScrollReveal>

          {/* Contest Summary */}
          <ScrollReveal delay={0.35}>
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
              {!isAuthenticated ? (
                <Button className="w-full" asChild data-testid="button-login-contests">
                  <a href="/api/login" className="flex items-center justify-center gap-2">
                    <LogIn className="w-4 h-4" />
                    Sign In to Enter
                  </a>
                </Button>
              ) : (
                <Link href="/contests">
                  <Button variant="outline" className="w-full" data-testid="button-view-contests">
                    View All Contests
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
          </ScrollReveal>

          {/* Portfolio Summary - Only show for authenticated users */}
          {isAuthenticated && data?.topHoldings && data.topHoldings.length > 0 && (
            <ScrollReveal delay={0.45}>
            <Card className="lg:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wide">Top Holdings</CardTitle>
                <DollarSign className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-2 sm:space-y-3">
                {data.topHoldings.slice(0, 3).map((holding) => (
                  <Link key={holding.player.id} href={`/player/${holding.player.id}`}>
                    <div className="p-2 rounded-md hover-elevate">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{holding.player.firstName} {holding.player.lastName}</span>
                        {holding.value !== null ? (
                          <span className="font-mono font-bold text-sm">${holding.value}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">No value</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{holding.quantity} shares</span>
                        {holding.pnl !== null ? (
                          <span className={parseFloat(holding.pnl) >= 0 ? 'text-positive' : 'text-negative'}>
                            {parseFloat(holding.pnl) >= 0 ? '+' : ''}${holding.pnl} ({holding.pnlPercent}%)
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
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
            </ScrollReveal>
          )}
        </div>
      </div>
      </div>

      {/* Player Selection Dialog */}
      <Dialog open={showPlayerSelection} onOpenChange={(open) => {
        setShowPlayerSelection(open);
        if (!open) {
          setSelectedPlayers([]);
        } else {
          // Pre-populate selected players when opening dialog
          if (data?.vesting?.players && data.vesting.players.length > 0) {
            const activePlayers = data.vesting.players
              .map(p => p.player)
              .filter((p): p is Player => p !== undefined);
            setSelectedPlayers(activePlayers);
          } else if (data?.vesting?.player) {
            // Legacy single-player mode - add the single player
            setSelectedPlayers([data.vesting.player]);
          }
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Players to Vest ({selectedPlayers.length}/10)</DialogTitle>
            <DialogDescription>
              Choose up to 10 players to vest shares. Total rate is 100 shares/hour distributed equally across selected players.
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

          {/* Sort Controls */}
          <div className="px-1">
            <div className="text-xs font-medium text-muted-foreground mb-1.5">Sort by:</div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={sortField === 'name' ? 'default' : 'outline'}
                onClick={() => {
                  if (sortField === 'name') {
                    setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortField('name');
                    setSortDirection('desc');
                  }
                }}
                className="text-xs h-7"
                data-testid="button-sort-name"
              >
                Name {sortField === 'name' && <ArrowUpDown className="w-3 h-3 ml-1" />}
              </Button>
              <Button
                size="sm"
                variant={sortField === 'fantasyPoints' ? 'default' : 'outline'}
                onClick={() => {
                  if (sortField === 'fantasyPoints') {
                    setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortField('fantasyPoints');
                    setSortDirection('desc');
                  }
                }}
                className="text-xs h-7"
                data-testid="button-sort-fantasy-points"
              >
                Fantasy Pts/G {sortField === 'fantasyPoints' && <ArrowUpDown className="w-3 h-3 ml-1" />}
              </Button>
              <Button
                size="sm"
                variant={sortField === 'marketValue' ? 'default' : 'outline'}
                onClick={() => {
                  if (sortField === 'marketValue') {
                    setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortField('marketValue');
                    setSortDirection('desc');
                  }
                }}
                className="text-xs h-7"
                data-testid="button-sort-market-value"
              >
                Market Value {sortField === 'marketValue' && <ArrowUpDown className="w-3 h-3 ml-1" />}
              </Button>
            </div>
          </div>

          {/* Selected Players List */}
          {selectedPlayers.length > 0 && (
            <div className="px-1 pb-2 border-b">
              <div className="text-xs font-medium text-muted-foreground mb-2">Selected Players:</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedPlayers.map((player) => (
                  <Badge 
                    key={player.id} 
                    variant="secondary"
                    className="text-xs px-2 py-1 cursor-pointer hover-elevate"
                    onClick={() => setSelectedPlayers(prev => prev.filter(p => p.id !== player.id))}
                    data-testid={`badge-selected-player-${player.id}`}
                  >
                    {player.firstName} {player.lastName} ({Math.floor(100 / selectedPlayers.length)} sh/hr) ×
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-y-auto flex-1 px-1">
            <div className="space-y-2">
              {filteredPlayers.map((player, index) => {
                const isSelected = selectedPlayers.some(p => p.id === player.id);
                const items = [
                  <PlayerCard
                    key={player.id}
                    player={player}
                    isExpanded={expandedPlayerId === player.id}
                    onToggleExpand={() => setExpandedPlayerId(
                      expandedPlayerId === player.id ? null : player.id
                    )}
                    onSelect={() => {
                      if (isSelected) {
                        setSelectedPlayers(prev => prev.filter(p => p.id !== player.id));
                      } else if (selectedPlayers.length < 10) {
                        setSelectedPlayers(prev => [...prev, player]);
                      } else {
                        toast({
                          title: "Maximum Reached",
                          description: "You can select up to 10 players",
                          variant: "destructive",
                        });
                      }
                    }}
                    isPending={startVestingMutation.isPending}
                    isSelected={isSelected}
                  />
                ];
                
                // Insert ad every 6 players
                if ((index + 1) % 6 === 0 && index < filteredPlayers.length - 1) {
                  items.push(
                    <div key={`ad-${index}`} className="my-2">
                      <AdSenseAd slot="2800193816" format="fluid" layoutKey="-i2-7+2w-11-86" />
                    </div>
                  );
                }
                
                return items;
              })}
            </div>
            {filteredPlayers.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No players found matching your criteria</p>
              </div>
            )}
          </div>

          {/* Confirm Button */}
          <div className="px-1 pt-3 border-t">
            <AnimatedButton
              className="w-full"
              disabled={selectedPlayers.length === 0}
              isLoading={startVestingMutation.isPending}
              isSuccess={startVestingMutation.isSuccess}
              loadingText="Starting..."
              successText="Vesting Started!"
              onClick={() => startVestingMutation.mutate(selectedPlayers.map(p => p.id))}
              data-testid="button-confirm-vesting-selection"
            >
              Start Vesting {selectedPlayers.length} Player{selectedPlayers.length !== 1 ? 's' : ''}
            </AnimatedButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Player Card Component with Stats and Recent Games
function PlayerCard({ 
  player, 
  isExpanded, 
  onToggleExpand, 
  onSelect, 
  isPending,
  isSelected = false,
}: { 
  player: Player; 
  isExpanded: boolean; 
  onToggleExpand: () => void; 
  onSelect: () => void; 
  isPending: boolean;
  isSelected?: boolean;
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
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">
                      <span className="font-bold">{(player as any).avgFantasyPointsPerGame || "0.0"}</span> FPG
                    </span>
                    <span>·</span>
                    {player.lastTradePrice ? (
                      <AnimatedPrice 
                        value={parseFloat(player.lastTradePrice)} 
                        size="sm" 
                        className="font-mono font-bold"
                      />
                    ) : (
                      <span className="text-muted-foreground">No value</span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Season Averages */}
              {stats && !statsLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
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
                variant={isSelected ? "default" : "outline"}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                disabled={isPending}
                data-testid={`button-select-player-${player.id}`}
                className="whitespace-nowrap"
              >
                {isPending ? "..." : isSelected ? "✓ Added" : "Add"}
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

// Helper function to build Plain Text Sports URL from game data
// Takes game date and team codes directly from database
// Plain Text Sports format: https://plaintextsports.com/nba/YYYY-MM-DD/away-home
function getPlainTextSportsUrl(game: DailyGame): string {
  try {
    // Format date as YYYY-MM-DD
    const gameDate = new Date(game.date);
    const year = gameDate.getFullYear();
    const month = String(gameDate.getMonth() + 1).padStart(2, '0');
    const day = String(gameDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    // Team code mapping for Plain Text Sports URLs only
    // MySportsFeeds uses BRO but Plain Text Sports uses BKN for Brooklyn
    const teamCodeMapping: Record<string, string> = {
      'BRO': 'BKN'
    };
    
    // Apply mapping and lowercase for URL
    const awayTeam = (teamCodeMapping[game.awayTeam] || game.awayTeam).toLowerCase();
    const homeTeam = (teamCodeMapping[game.homeTeam] || game.homeTeam).toLowerCase();
    
    return `https://plaintextsports.com/nba/${formattedDate}/${awayTeam}-${homeTeam}`;
  } catch (error) {
    console.error('[Game Card] Error building Plain Text Sports URL:', error);
    return '#';
  }
}

