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
import { formatBalance } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { invalidatePortfolioQueries } from "@/lib/cache-invalidation";
import { calculateVestingShares } from "@shared/vesting-utils";
import { DashboardScanners } from "@/components/marketplace-scanners";
import { useVesting } from "@/lib/vesting-context";
import { PlayerName } from "@/components/player-name";
import { WhopAd } from "@/components/whop-ad";
import { Shimmer, ShimmerCard, ScrollReveal, AnimatedButton, SwipeHint } from "@/components/ui/animations";
import { AnimatedPrice } from "@/components/ui/animated-price";
import { useSport } from "@/lib/sport-context";
import { SportSelector } from "@/components/sport-selector";
import { OnboardingMissions } from "@/components/onboarding-missions";
import { MarketTicker } from "@/components/market-ticker";

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
  const { isAuthenticated, user } = useAuth();
  const isPremiumUser = user?.isPremium || false;
  const { openRedemptionModal } = useVesting();
  const [, setLocation] = useLocation();
  const [flippedGameId, setFlippedGameId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { sport } = useSport();

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

      // Pool-based vesting: shares always accrue to pool regardless of player selection
      const sharesPerHour = vesting.sharesPerHour || (isPremiumUser ? 200 : 100);

      // Guard against missing required fields
      if (!vesting.lastAccruedAt) {
        setProjectedShares(vesting.sharesAccumulated || 0);
        return;
      }

      // Use shared utility to ensure frontend matches backend calculation exactly
      const result = calculateVestingShares({
        sharesAccumulated: vesting.sharesAccumulated || 0,
        residualMs: vesting.residualMs || 0,
        lastAccruedAt: vesting.lastAccruedAt,
        sharesPerHour: sharesPerHour,
        capLimit: vesting.capLimit || (isPremiumUser ? 4800 : 2400),
      });

      setProjectedShares(result.projectedShares);
    };

    // Calculate immediately and then every second
    calculateProjectedShares();
    const interval = setInterval(calculateProjectedShares, 1000);

    return () => clearInterval(interval);
  }, [
    data?.vesting?.lastAccruedAt,
    data?.vesting?.residualMs,
    data?.vesting?.sharesAccumulated,
    data?.vesting?.sharesPerHour,
    data?.vesting?.capLimit,
    isPremiumUser,
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
    queryKey: ['/api/games', formattedDate, sport],
    queryFn: async () => {
      const endpoint = isToday(selectedDate)
        ? `/api/games/today?sport=${sport}`
        : `/api/games/date/${formattedDate}?sport=${sport}`;
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
                <Link href="/login" className="flex items-center gap-2">
                  Sign In
                  <LogIn className="w-3 h-3" />
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* Market Activity Ticker */}
        <MarketTicker />

        {/* Main Dashboard Grid */}
        <div className="p-3 sm:p-4 max-w-full overflow-x-hidden space-y-4 sm:space-y-6">
          {/* Missions Section */}
          {isAuthenticated && (
            <div className="mb-4">
              <OnboardingMissions />
            </div>
          )}

          {/* Balance Header - Only show for authenticated users */}
          {isAuthenticated && data?.user && (
            <div className="p-4 sm:p-8 rounded-2xl bg-card/60 backdrop-blur-xl border border-white/5 shadow-2xl relative overflow-hidden group">
              {/* Background Glow */}
              <div className="absolute top-0 left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
              {/* Labels row */}
              <div className="flex justify-between gap-4 mb-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-sans">Cash Balance</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-sans">Portfolio Value</div>
              </div>

              {/* Values row */}
              <div className="flex justify-between gap-4 items-center">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="fintech-balance text-foreground truncate" data-testid="text-balance">
                    <AnimatedPrice
                      value={parseFloat(data?.user?.balance || "0")}
                      size="lg"
                      showArrow={false}
                      className="text-2xl sm:text-3xl font-bold font-mono"
                    />
                  </div>
                  {data?.user?.cashRank && data?.user.cashRank > 0 && (
                    <button
                      onClick={() => setLocation("/leaderboards#cashBalance")}
                      className="inline-flex items-center gap-1 border border-border px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs hover-elevate active-elevate-2 transition-colors cursor-pointer flex-shrink-0"
                      data-testid="badge-cash-rank"
                      aria-label={`Cash balance rank #${data?.user.cashRank}, click to view leaderboard`}
                    >
                      #{data?.user.cashRank}
                      {data?.user.cashRankChange !== null && data?.user.cashRankChange !== 0 && (
                        <span className={data?.user.cashRankChange > 0 ? "text-positive" : "text-negative"}>
                          {data?.user.cashRankChange > 0 ? (
                            <TrendingUp className="w-2.5 h-2.5 inline" />
                          ) : (
                            <TrendingDown className="w-2.5 h-2.5 inline" />
                          )}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                  <div className="fintech-balance text-foreground" data-testid="text-portfolio-value">
                    <AnimatedPrice
                      value={parseFloat(data?.user?.portfolioValue || "0")}
                      size="lg"
                      showArrow={false}
                      className="text-2xl sm:text-3xl font-bold font-mono"
                    />
                  </div>
                  {data?.user?.portfolioRank && data?.user.portfolioRank > 0 && (
                    <button
                      onClick={() => setLocation("/leaderboards#portfolioValue")}
                      className="inline-flex items-center gap-1 border border-border px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs hover-elevate active-elevate-2 transition-colors cursor-pointer flex-shrink-0"
                      data-testid="badge-portfolio-rank"
                      aria-label={`Portfolio value rank #${data?.user.portfolioRank}, click to view leaderboard`}
                    >
                      #{data?.user.portfolioRank}
                      {data?.user.portfolioRankChange !== null && data?.user.portfolioRankChange !== 0 && (
                        <span className={data?.user.portfolioRankChange > 0 ? "text-positive" : "text-negative"}>
                          {data?.user.portfolioRankChange > 0 ? (
                            <TrendingUp className="w-2.5 h-2.5 inline" />
                          ) : (
                            <TrendingDown className="w-2.5 h-2.5 inline" />
                          )}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Games */}
          {todayGames && (
            <ScrollReveal delay={0.1}>
              <Card className="mb-3 sm:mb-6">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 space-y-0 pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium uppercase tracking-wide">
                      {isToday(selectedDate) ? "Today's Games" : "Games"}
                    </CardTitle>
                    <SportSelector size="sm" />
                  </div>
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

          {/* Market Scanners Carousel */}
          <ScrollReveal delay={0.15}>
            <DashboardScanners />
          </ScrollReveal>

          {/* Widgets Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3">
            {/* Contest Summary */}
            <ScrollReveal delay={0.35}>
              <Card className="lg:col-span-1">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium uppercase tracking-wide">Contests</CardTitle>
                  <Trophy className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-2 sm:space-y-3">
                  {data?.contests?.slice(0, 3).map((contest) => (
                    <div key={contest.id} className="p-2 border rounded-md hover-elevate">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="font-medium text-xs truncate">{contest.name}</div>
                          <Badge variant="outline" className="text-[10px] h-4 mt-0.5">{contest.sport}</Badge>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-mono font-bold text-primary">${contest.totalPrizePool}</div>
                          <div className="text-[10px] text-muted-foreground">{contest.entryCount} entries</div>
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground">{contest.totalSharesEntered} shares entered</div>
                    </div>
                  ))}
                  {!isAuthenticated ? (
                    <Button className="w-full" asChild data-testid="button-login-contests">
                      <Link href="/login" className="flex items-center justify-center gap-2">
                        <LogIn className="w-4 h-4" />
                        Sign In to Enter
                      </Link>
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

    </>
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

