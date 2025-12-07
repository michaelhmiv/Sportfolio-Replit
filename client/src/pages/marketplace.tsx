import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWebSocket } from "@/lib/websocket";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, TrendingUp, TrendingDown, ArrowUpDown, Filter, Clock } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import type { Player } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { PlayerName } from "@/components/player-name";
import { AdSenseAd } from "@/components/adsense-ad";
import { Shimmer, ScrollReveal } from "@/components/ui/animations";
import { AnimatedPrice } from "@/components/ui/animated-price";
import { AnimatedList } from "@/components/ui/animated-list";
import { EmptyState } from "@/components/ui/empty-state";

type PlayerWithOrderBook = Player & {
  bestBid: string | null;
  bestAsk: string | null;
  bidSize: number;
  askSize: number;
};

type SortField = "price" | "volume" | "change" | "bid" | "ask";
type SortOrder = "asc" | "desc";

export default function Marketplace() {
  const searchParams = new URLSearchParams(useSearch());
  const [,setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "players");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("volume");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterHasBuyOrders, setFilterHasBuyOrders] = useState(false);
  const [filterHasSellOrders, setFilterHasSellOrders] = useState(false);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 50;
  const { subscribe} = useWebSocket();

  // Sync active tab with URL query parameter
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && (tab === "players" || tab === "activity")) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setLocation(value === "players" ? "/marketplace" : `/marketplace?tab=${value}`);
  };
  
  // Debounce search input (250ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    
    return () => clearTimeout(timer);
  }, [search]);

  const { data: teams } = useQuery<string[]>({
    queryKey: ["/api/teams"],
  });

  // WebSocket listener for real-time marketplace updates
  useEffect(() => {
    // Subscribe to trade events (affects prices, volume, 24h change)
    const unsubTrade = subscribe('trade', () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
    });

    // Subscribe to order book events
    const unsubOrderBook = subscribe('orderBook', () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
    });

    return () => {
      unsubTrade();
      unsubOrderBook();
    };
  }, [subscribe]);

  const { data: playersData, isLoading } = useQuery<{ players: PlayerWithOrderBook[]; total: number }>({
    queryKey: [
      "/api/players", 
      debouncedSearch, 
      teamFilter, 
      positionFilter, 
      sortField, 
      sortOrder, 
      filterHasBuyOrders, 
      filterHasSellOrders, 
      page
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (teamFilter && teamFilter !== "all") params.append("team", teamFilter);
      if (positionFilter && positionFilter !== "all") params.append("position", positionFilter);
      params.append("sortBy", sortField);
      params.append("sortOrder", sortOrder);
      if (filterHasBuyOrders) params.append("hasBuyOrders", "true");
      if (filterHasSellOrders) params.append("hasSellOrders", "true");
      params.append("limit", String(ITEMS_PER_PAGE));
      params.append("offset", String((page - 1) * ITEMS_PER_PAGE));
      
      const url = `/api/players?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch players");
      const data = await res.json();
      return data;
    },
  });

  const players = playersData?.players || [];
  const totalCount = playersData?.total || 0;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Reset to page 1 when any filter or sort changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, teamFilter, positionFilter, sortField, sortOrder, filterHasBuyOrders, filterHasSellOrders]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-4">
          <h1 className="hidden sm:block text-3xl font-bold mb-2">Marketplace</h1>
          <p className="text-muted-foreground">Browse and trade player shares</p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="players" data-testid="tab-players">Players</TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">Market Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="players" className="space-y-4">
            {/* Filters */}
            <ScrollReveal>
            <Card>
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search players..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-players"
                />
              </div>
              
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger data-testid="select-team-filter">
                  <SelectValue placeholder="All Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teams?.map((team) => (
                    <SelectItem key={team} value={team}>{team}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={positionFilter} onValueChange={setPositionFilter}>
                <SelectTrigger data-testid="select-position-filter">
                  <SelectValue placeholder="All Positions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Positions</SelectItem>
                  <SelectItem value="PG">Point Guard</SelectItem>
                  <SelectItem value="SG">Shooting Guard</SelectItem>
                  <SelectItem value="SF">Small Forward</SelectItem>
                  <SelectItem value="PF">Power Forward</SelectItem>
                  <SelectItem value="C">Center</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Order Book Filters */}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Show only:</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="filter-buy-orders" 
                  checked={filterHasBuyOrders}
                  onCheckedChange={(checked) => setFilterHasBuyOrders(checked as boolean)}
                  data-testid="checkbox-filter-buy-orders"
                />
                <label htmlFor="filter-buy-orders" className="text-sm cursor-pointer">
                  Has Buy Orders
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="filter-sell-orders" 
                  checked={filterHasSellOrders}
                  onCheckedChange={(checked) => setFilterHasSellOrders(checked as boolean)}
                  data-testid="checkbox-filter-sell-orders"
                />
                <label htmlFor="filter-sell-orders" className="text-sm cursor-pointer">
                  Has Sell Orders
                </label>
              </div>
              {(filterHasBuyOrders || filterHasSellOrders) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFilterHasBuyOrders(false);
                    setFilterHasSellOrders(false);
                  }}
                  className="text-xs"
                  data-testid="button-clear-filters"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        </ScrollReveal>

        {/* Player Table */}
        <ScrollReveal delay={0.15}>
        <Card>
          <CardHeader className="p-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">All Players</CardTitle>
              {/* Mobile sort controls */}
              <div className="flex items-center gap-1 sm:hidden flex-wrap">
                <Button
                  size="sm"
                  variant={sortField === 'bid' ? 'default' : 'outline'}
                  onClick={() => toggleSort("bid")}
                  className="text-xs"
                  data-testid="button-sort-bid-mobile"
                >
                  Bid {sortField === 'bid' && <ArrowUpDown className="w-3 h-3 ml-1" />}
                </Button>
                <Button
                  size="sm"
                  variant={sortField === 'ask' ? 'default' : 'outline'}
                  onClick={() => toggleSort("ask")}
                  className="text-xs"
                  data-testid="button-sort-ask-mobile"
                >
                  Ask {sortField === 'ask' && <ArrowUpDown className="w-3 h-3 ml-1" />}
                </Button>
                <Button
                  size="sm"
                  variant={sortField === 'volume' ? 'default' : 'outline'}
                  onClick={() => toggleSort("volume")}
                  className="text-xs"
                  data-testid="button-sort-volume-mobile"
                >
                  Vol {sortField === 'volume' && <ArrowUpDown className="w-3 h-3 ml-1" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-2">
                {[75, 85, 65, 90, 70, 80, 60, 88].map((width, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 border-b last:border-0">
                    <Shimmer width="32px" height="32px" className="rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Shimmer height="16px" width={`${width}%`} />
                      <Shimmer height="12px" width="100px" />
                    </div>
                    <div className="hidden sm:flex flex-col items-end gap-1">
                      <Shimmer height="16px" width="60px" />
                      <Shimmer height="12px" width="40px" />
                    </div>
                    <Shimmer height="32px" width="60px" className="rounded-md" />
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <table className="w-full">
                  <thead className="border-b bg-muted/50 hidden sm:table-header-group">
                    <tr>
                      <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</th>
                      <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">Team</th>
                      <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <button 
                          onClick={() => toggleSort("price")} 
                          className="flex items-center gap-1 ml-auto hover-elevate px-2 py-1 rounded text-xs"
                          data-testid="button-sort-price"
                        >
                          Market Value <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden lg:table-cell">
                        <div className="flex items-center gap-1 justify-end">
                          <button 
                            onClick={() => toggleSort("bid")} 
                            className="hover-elevate px-2 py-1 rounded text-xs text-blue-500 dark:text-blue-400 flex items-center gap-0.5"
                            data-testid="button-sort-bid"
                          >
                            Bid {sortField === 'bid' && <ArrowUpDown className="w-3 h-3" />}
                          </button>
                          <span className="text-muted-foreground">/</span>
                          <button 
                            onClick={() => toggleSort("ask")} 
                            className="hover-elevate px-2 py-1 rounded text-xs text-red-500 dark:text-red-400 flex items-center gap-0.5"
                            data-testid="button-sort-ask"
                          >
                            Ask {sortField === 'ask' && <ArrowUpDown className="w-3 h-3" />}
                          </button>
                        </div>
                      </th>
                      <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden lg:table-cell">
                        <button 
                          onClick={() => toggleSort("volume")} 
                          className="flex items-center gap-1 ml-auto hover-elevate px-2 py-1 rounded text-xs"
                          data-testid="button-sort-volume"
                        >
                          24h Vol <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">
                        <button 
                          onClick={() => toggleSort("change")} 
                          className="flex items-center gap-1 ml-auto hover-elevate px-2 py-1 rounded text-xs"
                          data-testid="button-sort-change"
                        >
                          24h Change <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.flatMap((player: PlayerWithOrderBook, index: number) => {
                      const playerRow = (
                      <tr 
                        key={player.id} 
                        className="border-b last:border-0 hover-elevate"
                        data-testid={`row-player-${player.id}`}
                      >
                        {/* Mobile layout: stacked info */}
                        <td className="px-2 py-2 sm:hidden" colSpan={6}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <span className="font-bold text-xs">{player.firstName[0]}{player.lastName[0]}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-sm">
                                  <PlayerName 
                                    playerId={player.id} 
                                    firstName={player.firstName} 
                                    lastName={player.lastName}
                                    className="text-sm"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                                  <span className="text-muted-foreground">{player.team} • {player.position}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs mt-0.5">
                                  {player.lastTradePrice ? (
                                    <AnimatedPrice 
                                      value={parseFloat(player.lastTradePrice)} 
                                      size="sm" 
                                      className="font-mono font-bold"
                                    />
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                  <span className="text-muted-foreground">•</span>
                                  <span className="text-blue-500 dark:text-blue-400 font-mono font-bold">
                                    {player.bestBid ? `$${player.bestBid}` : '-'}
                                  </span>
                                  <span className="text-muted-foreground">/</span>
                                  <span className="text-red-500 dark:text-red-400 font-mono font-bold">
                                    {player.bestAsk ? `$${player.bestAsk}` : '-'}
                                  </span>
                                  <span className="text-muted-foreground">•</span>
                                  <span className="text-muted-foreground">Vol: {player.volume24h > 0 ? player.volume24h.toLocaleString() : '-'}</span>
                                </div>
                              </div>
                            </div>
                            <Link href={`/player/${player.id}`}>
                              <Button size="sm" data-testid={`button-trade-${player.id}`}>Trade</Button>
                            </Link>
                          </div>
                        </td>

                        {/* Desktop layout: table cells */}
                        <td className="px-2 py-1.5 hidden sm:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="font-bold text-xs">{player.firstName[0]}{player.lastName[0]}</span>
                            </div>
                            <div>
                              <div className="font-medium text-sm">
                                <PlayerName 
                                  playerId={player.id} 
                                  firstName={player.firstName} 
                                  lastName={player.lastName}
                                  className="text-sm"
                                />
                              </div>
                              <div className="text-xs text-muted-foreground md:hidden">{player.team} • {player.position}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 hidden md:table-cell">
                          <Badge variant="outline" className="text-xs">{player.team}</Badge>
                        </td>
                        <td className="px-2 py-1.5 text-right hidden sm:table-cell" data-testid={`text-market-value-${player.id}`}>
                          {player.lastTradePrice ? (
                            <AnimatedPrice 
                              value={parseFloat(player.lastTradePrice)} 
                              size="sm" 
                              className="font-mono font-bold justify-end"
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs font-normal">-</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right hidden lg:table-cell">
                          <div className="flex items-center justify-end gap-2 font-mono text-sm font-bold">
                            <span className="text-blue-500 dark:text-blue-400" data-testid={`text-bid-${player.id}`}>
                              {player.bestBid || '-'}
                            </span>
                            <span className="text-muted-foreground font-normal">×</span>
                            <span className="text-red-500 dark:text-red-400" data-testid={`text-ask-${player.id}`}>
                              {player.bestAsk || '-'}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground">{player.volume24h > 0 ? player.volume24h.toLocaleString() : '-'}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right hidden md:table-cell">
                          <div className={`flex items-center justify-end gap-1 ${parseFloat(player.priceChange24h) >= 0 ? 'text-positive' : 'text-negative'}`}>
                            {parseFloat(player.priceChange24h) >= 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            <span className="font-medium text-xs">
                              {parseFloat(player.priceChange24h) >= 0 ? '+' : ''}{player.priceChange24h}%
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 hidden sm:table-cell">
                          <Link href={`/player/${player.id}`}>
                            <Button size="sm" data-testid={`button-trade-${player.id}`}>Trade</Button>
                          </Link>
                        </td>
                      </tr>
                      );

                      // Insert ad after every 6 players (but not after the last player)
                      if ((index + 1) % 6 === 0 && index < players.length - 1) {
                        return [
                          playerRow,
                          <tr key={`ad-${index}`} className="border-b">
                            <td colSpan={7} className="p-0">
                              <AdSenseAd slot="8848272002" format="fluid" layoutKey="-i2-7+2w-11-86" className="py-4" />
                            </td>
                          </tr>
                        ];
                      }

                      return [playerRow];
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {!isLoading && players.length > 0 && totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between px-2">
                <div className="text-sm text-muted-foreground">
                  Showing {((page - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(page * ITEMS_PER_PAGE, totalCount)} of {totalCount} players
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </ScrollReveal>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <MarketActivityFeed />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

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

function MarketActivityFeed() {
  const { subscribe } = useWebSocket();
  const [playerFilter, setPlayerFilter] = useState("");
  const [debouncedPlayerFilter, setDebouncedPlayerFilter] = useState("");
  
  // Debounce player filter
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPlayerFilter(playerFilter);
    }, 250);
    return () => clearTimeout(timer);
  }, [playerFilter]);

  const { data: activity = [], isLoading } = useQuery<MarketActivity[]>({
    queryKey: ["/api/market/activity", debouncedPlayerFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("limit", "150");
      if (debouncedPlayerFilter) {
        params.append("playerSearch", debouncedPlayerFilter);
      }
      const response = await fetch(`/api/market/activity?${params.toString()}`);
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

  const getActivityLabel = (item: MarketActivity) => {
    if (item.activityType === "trade") {
      return { type: "Trade", color: "text-foreground font-semibold" };
    }
    if (item.activityType === "order_cancelled") {
      return { type: "Cancelled", color: "text-muted-foreground" };
    }
    // order_placed
    const orderTypeLabel = item.orderType === "limit" ? "Limit" : "Market";
    return { 
      type: orderTypeLabel, 
      color: item.side === "buy" ? "text-blue-500" : "text-red-500" 
    };
  };

  const getSideLabel = (item: MarketActivity) => {
    if (item.activityType === "trade") {
      return null; // No side label for trades
    }
    return item.side === "buy" ? "Buy" : "Sell";
  };

  const getUsername = (item: MarketActivity) => {
    if (item.activityType === "trade") {
      return (
        <span className="text-xs">
          <span className="text-blue-500">{item.buyerUsername}</span>
          <span className="text-muted-foreground mx-1">←</span>
          <span className="text-red-500">{item.sellerUsername}</span>
        </span>
      );
    }
    return <span className="text-xs">{item.username || "Unknown"}</span>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading activity...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle>Market Activity</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Filter by player..."
              value={playerFilter}
              onChange={(e) => setPlayerFilter(e.target.value)}
              className="pl-8 h-9"
              data-testid="input-filter-activity-player"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {activity.length === 0 ? (
          <EmptyState
            icon="chart"
            title={debouncedPlayerFilter ? "No activity for this player" : "No market activity yet"}
            description={debouncedPlayerFilter ? "Try searching for a different player." : "Trades will appear here as they happen."}
            size="sm"
            className="py-6"
            data-testid="empty-activity"
          />
        ) : (
          <AnimatedList
            items={activity}
            keyExtractor={(item) => `${item.activityType}-${item.id}`}
            animateDirection="right"
            staggerDelay={0.02}
            highlightNew={true}
            className="divide-y"
            renderItem={(item) => {
              const label = getActivityLabel(item);
              const sideLabel = getSideLabel(item);
              return (
                <div
                  className="flex items-center gap-2 px-3 py-2 hover-elevate text-sm"
                  data-testid={`activity-${item.activityType}-${item.id}`}
                >
                  {/* Time */}
                  <div className="w-16 text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true }).replace("about ", "").replace(" ago", "")}
                  </div>
                  
                  {/* Side and Order Type */}
                  <div className="w-20 text-xs font-medium flex-shrink-0">
                    {sideLabel && <span className={item.side === "buy" ? "text-blue-500" : "text-red-500"}>{sideLabel} </span>}
                    <span className={label.color}>{label.type}</span>
                  </div>
                  
                  {/* Player */}
                  <div className="flex-1 min-w-0">
                    <Link href={`/player/${item.playerId}`}>
                      <span className="font-medium hover:underline truncate block">
                        {item.playerFirstName} {item.playerLastName}
                      </span>
                    </Link>
                  </div>
                  
                  {/* Team */}
                  <div className="w-12 text-xs text-muted-foreground hidden md:block flex-shrink-0">
                    {item.playerTeam}
                  </div>
                  
                  {/* Price */}
                  <div className="w-16 text-right font-mono text-xs flex-shrink-0">
                    {item.price ? `$${item.price}` : item.limitPrice ? `$${item.limitPrice}` : "-"}
                  </div>
                  
                  {/* Quantity */}
                  <div className="w-14 text-right text-xs text-muted-foreground flex-shrink-0 hidden lg:block">
                    {item.quantity}×
                  </div>
                  
                  {/* User */}
                  <div className="w-32 text-muted-foreground truncate hidden xl:block flex-shrink-0">
                    {getUsername(item)}
                  </div>
                </div>
              );
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
