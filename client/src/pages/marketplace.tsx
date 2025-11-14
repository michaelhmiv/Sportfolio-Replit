import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

  const { data: players, isLoading } = useQuery<Player[]>({
    queryKey: ["/api/players", { search, team: teamFilter, position: positionFilter, sortField, sortOrder }],
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Marketplace</h1>
          <p className="text-muted-foreground">Browse and trade player shares</p>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  <SelectItem value="LAL">Lakers</SelectItem>
                  <SelectItem value="GSW">Warriors</SelectItem>
                  <SelectItem value="BOS">Celtics</SelectItem>
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
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wide">All Players</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading players...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Player</th>
                      <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</th>
                      <th className="text-left p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Position</th>
                      <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <button 
                          onClick={() => toggleSort("price")} 
                          className="flex items-center gap-1 ml-auto hover-elevate px-2 py-1 rounded"
                          data-testid="button-sort-price"
                        >
                          Price <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <button 
                          onClick={() => toggleSort("volume")} 
                          className="flex items-center gap-1 ml-auto hover-elevate px-2 py-1 rounded"
                          data-testid="button-sort-volume"
                        >
                          24h Volume <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-right p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <button 
                          onClick={() => toggleSort("change")} 
                          className="flex items-center gap-1 ml-auto hover-elevate px-2 py-1 rounded"
                          data-testid="button-sort-change"
                        >
                          24h Change <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="p-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {players?.map((player) => (
                      <tr 
                        key={player.id} 
                        className="border-b last:border-0 hover-elevate"
                        data-testid={`row-player-${player.id}`}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="font-bold text-sm">{player.firstName[0]}{player.lastName[0]}</span>
                            </div>
                            <div>
                              <div className="font-medium">{player.firstName} {player.lastName}</div>
                              <div className="text-xs text-muted-foreground">#{player.jerseyNumber}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline">{player.team}</Badge>
                        </td>
                        <td className="p-4">
                          <span className="text-sm text-muted-foreground">{player.position}</span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="font-mono font-bold text-lg" data-testid={`text-price-${player.id}`}>
                            ${player.currentPrice}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-sm text-muted-foreground">{player.volume24h.toLocaleString()}</span>
                        </td>
                        <td className="p-4 text-right">
                          <div className={`flex items-center justify-end gap-1 ${parseFloat(player.priceChange24h) >= 0 ? 'text-positive' : 'text-negative'}`}>
                            {parseFloat(player.priceChange24h) >= 0 ? (
                              <TrendingUp className="w-4 h-4" />
                            ) : (
                              <TrendingDown className="w-4 h-4" />
                            )}
                            <span className="font-medium">
                              {parseFloat(player.priceChange24h) >= 0 ? '+' : ''}{player.priceChange24h}%
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
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
