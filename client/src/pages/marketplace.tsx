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
import { Search, TrendingUp, TrendingDown, ArrowUpDown, Filter } from "lucide-react";
import { Link } from "wouter";
import type { Player } from "@shared/schema";

type PlayerWithOrderBook = Player & {
  bestBid: string | null;
  bestAsk: string | null;
  bidSize: number;
  askSize: number;
};

type SortField = "price" | "volume" | "change" | "bid" | "ask";
type SortOrder = "asc" | "desc";

export default function Marketplace() {
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("volume");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterHasBuyOrders, setFilterHasBuyOrders] = useState(false);
  const [filterHasSellOrders, setFilterHasSellOrders] = useState(false);
  const { subscribe } = useWebSocket();

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

  const { data: players, isLoading } = useQuery<PlayerWithOrderBook[]>({
    queryKey: ["/api/players", search, teamFilter, positionFilter, sortField, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (teamFilter && teamFilter !== "all") params.append("team", teamFilter);
      if (positionFilter && positionFilter !== "all") params.append("position", positionFilter);
      
      const url = `/api/players${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch players");
      const data = await res.json();
      // API now returns { players, total } for pagination
      return data.players || data;
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  // Client-side filtering and sorting
  const filteredAndSortedPlayers = players ? [...players]
    .filter((player) => {
      // Apply order book filters
      if (filterHasBuyOrders && !player.bestBid) return false;
      if (filterHasSellOrders && !player.bestAsk) return false;
      return true;
    })
    .sort((a, b) => {
      let aVal: number;
      let bVal: number;
      
      if (sortField === "price") {
        // Put players without market value at the end
        const aPrice = a.lastTradePrice ? parseFloat(a.lastTradePrice) : -1;
        const bPrice = b.lastTradePrice ? parseFloat(b.lastTradePrice) : -1;
        aVal = aPrice;
        bVal = bPrice;
      } else if (sortField === "volume") {
        aVal = a.volume24h;
        bVal = b.volume24h;
      } else if (sortField === "bid") {
        aVal = a.bestBid ? parseFloat(a.bestBid) : -1;
        bVal = b.bestBid ? parseFloat(b.bestBid) : -1;
      } else if (sortField === "ask") {
        aVal = a.bestAsk ? parseFloat(a.bestAsk) : -1;
        bVal = b.bestAsk ? parseFloat(b.bestAsk) : -1;
      } else {
        aVal = parseFloat(a.priceChange24h);
        bVal = parseFloat(b.priceChange24h);
      }
      
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    }) : [];

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-4">
          <h1 className="text-3xl font-bold mb-2">Marketplace</h1>
          <p className="text-muted-foreground">Browse and trade player shares</p>
        </div>

        {/* Filters */}
        <Card className="mb-3 sm:mb-6">
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

        {/* Player Table */}
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
              <div className="p-8 text-center text-muted-foreground">Loading players...</div>
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
                    {filteredAndSortedPlayers.map((player) => (
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
                                <div className="font-medium text-sm">{player.firstName} {player.lastName}</div>
                                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                                  <span className="text-muted-foreground">{player.team} • {player.position}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs mt-0.5">
                                  <span className="font-mono font-bold text-foreground">
                                    {player.lastTradePrice ? `$${player.lastTradePrice}` : '-'}
                                  </span>
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
                              <div className="font-medium text-sm">{player.firstName} {player.lastName}</div>
                              <div className="text-xs text-muted-foreground md:hidden">{player.team} • {player.position}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 hidden md:table-cell">
                          <Badge variant="outline" className="text-xs">{player.team}</Badge>
                        </td>
                        <td className="px-2 py-1.5 text-right hidden sm:table-cell">
                          <span className="font-mono font-bold text-sm" data-testid={`text-market-value-${player.id}`}>
                            {player.lastTradePrice ? `$${player.lastTradePrice}` : <span className="text-muted-foreground text-xs font-normal">-</span>}
                          </span>
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
