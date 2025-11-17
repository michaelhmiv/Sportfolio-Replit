import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWebSocket } from "@/lib/websocket";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, TrendingUp, TrendingDown, ArrowUpDown } from "lucide-react";
import { Link } from "wouter";
import type { Player } from "@shared/schema";

type SortField = "price" | "volume" | "change";
type SortOrder = "asc" | "desc";

export default function Marketplace() {
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("volume");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
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

  const { data: players, isLoading } = useQuery<Player[]>({
    queryKey: ["/api/players", search, teamFilter, positionFilter, sortField, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (teamFilter && teamFilter !== "all") params.append("team", teamFilter);
      if (positionFilter && positionFilter !== "all") params.append("position", positionFilter);
      
      const url = `/api/players${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
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

  // Client-side sorting
  const sortedPlayers = players ? [...players].sort((a, b) => {
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
    } else {
      aVal = parseFloat(a.priceChange24h);
      bVal = parseFloat(b.priceChange24h);
    }
    
    return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
  }) : [];

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-8">
          <h1 className="text-3xl font-bold mb-2">Marketplace</h1>
          <p className="text-muted-foreground">Browse and trade player shares</p>
        </div>

        {/* Filters */}
        <Card className="mb-3 sm:mb-6">
          <CardContent className="p-3 sm:p-6">
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
          </CardContent>
        </Card>

        {/* Player Table */}
        <Card>
          <CardHeader className="p-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wide">All Players</CardTitle>
              {/* Mobile sort controls */}
              <div className="flex items-center gap-1 sm:hidden">
                <Button
                  size="sm"
                  variant={sortField === 'price' ? 'default' : 'outline'}
                  onClick={() => toggleSort("price")}
                  className="text-xs"
                  data-testid="button-sort-price-mobile"
                >
                  Price {sortField === 'price' && <ArrowUpDown className="w-3 h-3 ml-1" />}
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
                <Button
                  size="sm"
                  variant={sortField === 'change' ? 'default' : 'outline'}
                  onClick={() => toggleSort("change")}
                  className="text-xs"
                  data-testid="button-sort-change-mobile"
                >
                  24h {sortField === 'change' && <ArrowUpDown className="w-3 h-3 ml-1" />}
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
                          Price <ArrowUpDown className="w-3 h-3" />
                        </button>
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
                    {sortedPlayers.map((player) => (
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
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                                  <span>{player.team}</span>
                                  <span>•</span>
                                  <span>{player.position}</span>
                                  <span>•</span>
                                  <span className="font-mono font-bold text-foreground">
                                    {player.lastTradePrice ? `$${player.lastTradePrice}` : '-'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                  <span>Vol: {player.volume24h > 0 ? player.volume24h.toLocaleString() : '-'}</span>
                                  <span>•</span>
                                  <span className={parseFloat(player.priceChange24h) >= 0 ? 'text-positive' : 'text-negative'}>
                                    {parseFloat(player.priceChange24h) >= 0 ? '+' : ''}{player.priceChange24h}%
                                  </span>
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
                          <span className="font-mono font-bold text-sm" data-testid={`text-price-${player.id}`}>
                            {player.lastTradePrice ? `$${player.lastTradePrice}` : <span className="text-muted-foreground text-xs font-normal">-</span>}
                          </span>
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
