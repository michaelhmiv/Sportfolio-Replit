import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { calculateVestingShares } from "@shared/vesting-utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Search, X, Trash2, Plus, Save, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import type { Player, VestingPreset } from "@shared/schema";

type SortField = 'name' | 'price' | 'priceChange' | 'volume' | 'marketCap' | 'fantasyPoints';
type SortDirection = 'asc' | 'desc';

interface PlayerWithStats extends Player {
  avgFantasyPointsPerGame?: string;
}

interface VestingData {
  vesting: {
    sharesAccumulated: number;
    residualMs: number;
    lastAccruedAt: string | null;
    capLimit: number;
    sharesPerHour: number;
  };
}

interface PresetWithPlayers extends VestingPreset {
  players: PlayerWithStats[];
}

interface RedemptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedPlayerIds?: string[];
}

interface PlayerDistribution {
  player: PlayerWithStats;
  shares: number;
  percentage: number;
}

export function RedemptionModal({ open, onOpenChange, preselectedPlayerIds = [] }: RedemptionModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [distributions, setDistributions] = useState<PlayerDistribution[]>([]);
  const [projectedShares, setProjectedShares] = useState(0);
  const [newPresetName, setNewPresetName] = useState("");
  const [showPresetSave, setShowPresetSave] = useState(false);
  const [activeTab, setActiveTab] = useState("directory");
  
  const [dirSearchQuery, setDirSearchQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("fantasyPoints");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [visibleLimit, setVisibleLimit] = useState(50);

  const isPremium = user?.isPremium || false;
  const capLimit = isPremium ? 4800 : 2400;
  const sharesPerHour = isPremium ? 200 : 100;

  const { data: dashboardData } = useQuery<VestingData>({
    queryKey: ['/api/dashboard'],
    enabled: open,
  });

  // Build query URL for server-side filtering - limit=1000 ensures full player access
  const playerQueryUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', '1000');
    if (dirSearchQuery) params.set('search', dirSearchQuery);
    if (teamFilter !== 'all') params.set('team', teamFilter);
    return `/api/players?${params.toString()}`;
  }, [dirSearchQuery, teamFilter]);

  const { data: playersData, isLoading: playersLoading } = useQuery<{ players: PlayerWithStats[], total: number }>({
    queryKey: [playerQueryUrl],
    enabled: open,
  });

  const { data: teamsData } = useQuery<string[]>({
    queryKey: ['/api/teams'],
    enabled: open,
  });

  const { data: presetsData } = useQuery<{ presets: PresetWithPlayers[] }>({
    queryKey: ['/api/vesting/presets'],
    enabled: open,
  });

  useEffect(() => {
    if (!dashboardData?.vesting) {
      setProjectedShares(0);
      return;
    }

    const vesting = dashboardData.vesting;
    
    const calculateProjection = () => {
      if (!vesting.lastAccruedAt) {
        setProjectedShares(vesting.sharesAccumulated || 0);
        return;
      }

      const result = calculateVestingShares({
        sharesAccumulated: vesting.sharesAccumulated || 0,
        residualMs: vesting.residualMs || 0,
        lastAccruedAt: vesting.lastAccruedAt,
        sharesPerHour: sharesPerHour,
        capLimit: capLimit,
      });

      setProjectedShares(Math.min(vesting.sharesAccumulated + result.sharesEarned, capLimit));
    };

    calculateProjection();
    const interval = setInterval(calculateProjection, 1000);
    return () => clearInterval(interval);
  }, [dashboardData?.vesting, sharesPerHour, capLimit]);

  useEffect(() => {
    if (open && preselectedPlayerIds.length > 0 && playersData?.players) {
      const selectedPlayers = playersData.players.filter(p => 
        preselectedPlayerIds.includes(p.id)
      );
      if (selectedPlayers.length > 0) {
        const sharesPerPlayer = Math.floor(projectedShares / selectedPlayers.length);
        const remainder = projectedShares % selectedPlayers.length;
        
        setDistributions(selectedPlayers.map((player, index) => ({
          player,
          shares: sharesPerPlayer + (index === 0 ? remainder : 0),
          percentage: 100 / selectedPlayers.length,
        })));
      }
    }
  }, [open, preselectedPlayerIds, playersData?.players, projectedShares]);

  useEffect(() => {
    if (!open) {
      setDistributions([]);
      setSearchQuery("");
      setNewPresetName("");
      setShowPresetSave(false);
      setActiveTab("directory");
      setDirSearchQuery("");
      setTeamFilter("all");
      setSortField("fantasyPoints");
      setSortDirection("desc");
      setVisibleLimit(50);
    }
  }, [open]);

  // Reset visible limit when search or filter changes
  useEffect(() => {
    setVisibleLimit(50);
  }, [dirSearchQuery, teamFilter, sortField, sortDirection]);

  const filteredPlayers = useMemo(() => {
    if (!playersData?.players) return [];
    const selectedIds = new Set(distributions.map(d => d.player.id));
    return playersData.players
      .filter(p => !selectedIds.has(p.id))
      .filter(p => 
        searchQuery.length === 0 ||
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.team?.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .slice(0, 50);
  }, [playersData?.players, distributions, searchQuery]);

  // Server-side filtering done via API, client-side sorting only (backend doesn't support fantasy pts sort)
  const directoryPlayers = useMemo(() => {
    if (!playersData?.players) return [];
    const selectedIds = new Set(distributions.map(d => d.player.id));
    
    // Only filter out already-selected players (search/team done server-side)
    let filtered = playersData.players.filter(p => !selectedIds.has(p.id));
    
    // Client-side sorting (backend may not support all sort fields like fantasyPoints)
    filtered.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      
      switch (sortField) {
        case 'name':
          aVal = `${a.firstName} ${a.lastName}`.toLowerCase();
          bVal = `${b.firstName} ${b.lastName}`.toLowerCase();
          break;
        case 'price':
          aVal = parseFloat(a.currentPrice || '0');
          bVal = parseFloat(b.currentPrice || '0');
          break;
        case 'priceChange':
          aVal = parseFloat(a.priceChange24h || '0');
          bVal = parseFloat(b.priceChange24h || '0');
          break;
        case 'volume':
          aVal = a.volume24h || 0;
          bVal = b.volume24h || 0;
          break;
        case 'marketCap':
          aVal = parseFloat(a.marketCap || '0');
          bVal = parseFloat(b.marketCap || '0');
          break;
        case 'fantasyPoints':
          aVal = parseFloat(a.avgFantasyPointsPerGame || '0');
          bVal = parseFloat(b.avgFantasyPointsPerGame || '0');
          break;
      }
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      return sortDirection === 'asc' 
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
    
    return filtered;
  }, [playersData?.players, distributions, sortField, sortDirection]);

  const redeemMutation = useMutation({
    mutationFn: async (distributionList: { playerId: string; shares: number }[]) => {
      const res = await apiRequest("POST", "/api/vesting/redeem", {
        distributions: distributionList,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Shares vested successfully",
        description: `Vested ${data.totalSharesRedeemed} shares to ${data.players.length} player(s)`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio'] });
      // Invalidate auth/user to update totalSharesMined and clear first-time indicator
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user?sync=true'] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to vest shares",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createPresetMutation = useMutation({
    mutationFn: async ({ name, playerIds }: { name: string; playerIds: string[] }) => {
      const res = await apiRequest("POST", "/api/vesting/presets", { name, playerIds });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Preset saved" });
      queryClient.invalidateQueries({ queryKey: ['/api/vesting/presets'] });
      setNewPresetName("");
      setShowPresetSave(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save preset",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePresetMutation = useMutation({
    mutationFn: async (presetId: string) => {
      const res = await apiRequest("DELETE", `/api/vesting/presets/${presetId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Preset deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/vesting/presets'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete preset",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addPlayer = (player: Player, switchToAllocate = false) => {
    const newDistributions = [...distributions, { player, shares: 0, percentage: 0 }];
    redistributeEvenly(newDistributions);
    if (switchToAllocate) {
      setActiveTab("allocate");
    }
  };

  const removePlayer = (playerId: string) => {
    const newDistributions = distributions.filter(d => d.player.id !== playerId);
    if (newDistributions.length > 0) {
      redistributeEvenly(newDistributions);
    } else {
      setDistributions([]);
    }
  };

  const redistributeEvenly = (dists: PlayerDistribution[]) => {
    if (dists.length === 0) {
      setDistributions([]);
      return;
    }
    const sharesPerPlayer = Math.floor(projectedShares / dists.length);
    const remainder = projectedShares % dists.length;
    
    setDistributions(dists.map((d, index) => ({
      ...d,
      shares: sharesPerPlayer + (index === 0 ? remainder : 0),
      percentage: 100 / dists.length,
    })));
  };

  const setPlayerShares = (playerId: string, newShares: number) => {
    const totalOthers = distributions.reduce((sum, d) => 
      d.player.id === playerId ? sum : sum + d.shares, 0
    );
    
    const maxForThisPlayer = projectedShares - totalOthers;
    const clampedShares = Math.min(Math.max(0, newShares), maxForThisPlayer);
    
    setDistributions(distributions.map(d => 
      d.player.id === playerId 
        ? { ...d, shares: clampedShares, percentage: (clampedShares / projectedShares) * 100 }
        : d
    ));
  };

  const setPlayerMax = (playerId: string) => {
    const totalOthers = distributions.reduce((sum, d) => 
      d.player.id === playerId ? sum : sum + d.shares, 0
    );
    setPlayerShares(playerId, projectedShares - totalOthers);
  };

  const loadPreset = (preset: PresetWithPlayers) => {
    const sharesPerPlayer = Math.floor(projectedShares / preset.players.length);
    const remainder = projectedShares % preset.players.length;
    
    setDistributions(preset.players.map((player, index) => ({
      player,
      shares: sharesPerPlayer + (index === 0 ? remainder : 0),
      percentage: 100 / preset.players.length,
    })));
    setActiveTab("allocate");
  };

  const toggleSortDirection = () => {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const handleRedeem = () => {
    const distributionList = distributions
      .filter(d => d.shares > 0)
      .map(d => ({ playerId: d.player.id, shares: d.shares }));
    
    if (distributionList.length === 0) {
      toast({
        title: "No shares to vest",
        description: "Add players and allocate shares before vesting",
        variant: "destructive",
      });
      return;
    }

    redeemMutation.mutate(distributionList);
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) {
      toast({ title: "Enter a preset name", variant: "destructive" });
      return;
    }
    if (distributions.length === 0) {
      toast({ title: "Add players before saving", variant: "destructive" });
      return;
    }
    createPresetMutation.mutate({
      name: newPresetName.trim(),
      playerIds: distributions.map(d => d.player.id),
    });
  };

  const totalAllocated = distributions.reduce((sum, d) => sum + d.shares, 0);
  const remainingToAllocate = projectedShares - totalAllocated;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Vest Shares</DialogTitle>
          <DialogDescription>
            Allocate your {projectedShares.toLocaleString()} pooled shares to players
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="directory" data-testid="tab-directory">Directory</TabsTrigger>
            <TabsTrigger value="allocate" data-testid="tab-allocate">Allocate</TabsTrigger>
            <TabsTrigger value="presets" data-testid="tab-presets">Presets</TabsTrigger>
          </TabsList>

          <TabsContent value="directory" className="flex-1 flex flex-col min-h-0 mt-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search players..."
                  value={dirSearchQuery}
                  onChange={(e) => setDirSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                  data-testid="input-dir-search"
                />
              </div>
              <div className="flex gap-2">
                <Select value={teamFilter} onValueChange={setTeamFilter}>
                  <SelectTrigger className="w-[120px] h-9" data-testid="select-team-filter">
                    <SelectValue placeholder="Team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Teams</SelectItem>
                    {teamsData?.map(team => (
                      <SelectItem key={team} value={team}>{team}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                  <SelectTrigger className="w-[100px] h-9" data-testid="select-sort-field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fantasyPoints">FPTS</SelectItem>
                    <SelectItem value="volume">Volume</SelectItem>
                    <SelectItem value="price">Price</SelectItem>
                    <SelectItem value="priceChange">Change</SelectItem>
                    <SelectItem value="marketCap">Mkt Cap</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={toggleSortDirection}
                  className="h-9 w-9 shrink-0"
                  data-testid="button-sort-direction"
                >
                  <ArrowUpDown className={cn("h-4 w-4", sortDirection === "asc" && "rotate-180")} />
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground px-1">
              {playersLoading ? "Loading..." : (
                <>
                  Showing {Math.min(visibleLimit, directoryPlayers.length)} of {playersData?.total || directoryPlayers.length} players
                  {distributions.length > 0 && (
                    <span className="ml-2 text-primary font-medium">
                      ({distributions.length} selected)
                    </span>
                  )}
                </>
              )}
            </div>

            <ScrollArea className="flex-1 h-[300px] sm:h-[350px] border rounded-md">
              <div className="divide-y">
                {playersLoading ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Loading players...
                  </div>
                ) : directoryPlayers.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No players found
                  </div>
                ) : (
                  <>
                    {directoryPlayers.slice(0, visibleLimit).map(player => {
                      const price = parseFloat(player.currentPrice || '0');
                      const change = parseFloat(player.priceChange24h || '0');
                      const fpts = parseFloat(player.avgFantasyPointsPerGame || '0');
                      
                      return (
                        <div 
                          key={player.id}
                          className="flex items-center gap-1 sm:gap-2 px-2 py-1.5 hover-elevate text-sm"
                          data-testid={`dir-player-${player.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <span className="font-medium truncate block">
                              {player.firstName} {player.lastName}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground w-8 sm:w-10 shrink-0 hidden sm:inline">
                            {player.team}
                          </span>
                          <span className="text-xs font-mono w-12 sm:w-14 text-right shrink-0">
                            ${price.toFixed(2)}
                          </span>
                          <span className={cn(
                            "text-xs font-mono w-10 sm:w-12 text-right shrink-0 hidden sm:inline",
                            change > 0 ? "text-green-500" : change < 0 ? "text-red-500" : "text-muted-foreground"
                          )}>
                            {change > 0 ? '+' : ''}{change.toFixed(1)}%
                          </span>
                          <span className="text-xs font-mono w-8 sm:w-10 text-right shrink-0 text-muted-foreground" title="Fantasy Points">
                            {fpts.toFixed(1)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => addPlayer(player, true)}
                            className="px-2 shrink-0"
                            data-testid={`button-dir-add-${player.id}`}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                    {visibleLimit < directoryPlayers.length && (
                      <div className="p-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setVisibleLimit(prev => prev + 50)}
                          data-testid="button-load-more"
                        >
                          Load More ({directoryPlayers.length - visibleLimit} remaining)
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="allocate" className="flex-1 flex flex-col min-h-0 mt-4 space-y-4">
            <div className="flex items-center gap-2 text-sm bg-muted/50 rounded-md p-2">
              <span className="text-muted-foreground">Available:</span>
              <span className="font-mono font-bold">{projectedShares.toLocaleString()}</span>
              <span className="text-muted-foreground ml-auto">Allocated:</span>
              <span className={cn(
                "font-mono font-bold",
                remainingToAllocate > 0 && "text-yellow-500"
              )}>{totalAllocated.toLocaleString()}</span>
              {remainingToAllocate > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {remainingToAllocate} remaining
                </Badge>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-players"
              />
            </div>

            {searchQuery && (
              <ScrollArea className="h-32 border rounded-md">
                <div className="p-1">
                  {filteredPlayers.map(player => (
                    <button
                      key={player.id}
                      onClick={() => addPlayer(player)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover-elevate rounded-sm text-left"
                      data-testid={`button-add-player-${player.id}`}
                    >
                      <Plus className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{player.firstName} {player.lastName}</span>
                      <span className="text-xs text-muted-foreground">{player.team}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{player.position}</span>
                    </button>
                  ))}
                  {filteredPlayers.length === 0 && (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">No players found</div>
                  )}
                </div>
              </ScrollArea>
            )}

            <ScrollArea className="flex-1 h-[250px] sm:h-[300px] border rounded-md">
              <div className="p-2 space-y-2">
                {distributions.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Search and add players to allocate shares
                  </div>
                ) : (
                  distributions.map(dist => (
                    <div 
                      key={dist.player.id} 
                      className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 border rounded-md bg-card"
                      data-testid={`distribution-row-${dist.player.id}`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-medium text-sm truncate">
                          {dist.player.firstName} {dist.player.lastName}
                        </span>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {dist.player.team}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removePlayer(dist.player.id)}
                          className="ml-auto sm:hidden"
                          data-testid={`button-remove-mobile-${dist.player.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Input
                          type="number"
                          min={0}
                          max={projectedShares}
                          value={dist.shares}
                          onChange={(e) => setPlayerShares(dist.player.id, parseInt(e.target.value) || 0)}
                          className="w-16 sm:w-20 h-8 text-right font-mono text-sm"
                          data-testid={`input-shares-${dist.player.id}`}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPlayerMax(dist.player.id)}
                          className="h-8 px-2 text-xs"
                          data-testid={`button-max-${dist.player.id}`}
                        >
                          Max
                        </Button>
                        <Slider
                          value={[dist.shares]}
                          min={0}
                          max={projectedShares}
                          step={1}
                          onValueChange={([val]) => setPlayerShares(dist.player.id, val)}
                          className="flex-1 min-w-[80px] sm:w-24"
                          data-testid={`slider-${dist.player.id}`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removePlayer(dist.player.id)}
                          className="hidden sm:flex"
                          data-testid={`button-remove-${dist.player.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {distributions.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => redistributeEvenly(distributions)}
                  data-testid="button-even-split"
                >
                  Even Split
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPresetSave(!showPresetSave)}
                  data-testid="button-toggle-save-preset"
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save as Preset
                </Button>
              </div>
            )}

            {showPresetSave && (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Preset name..."
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  className="flex-1"
                  data-testid="input-preset-name"
                />
                <Button
                  size="sm"
                  onClick={handleSavePreset}
                  disabled={createPresetMutation.isPending}
                  data-testid="button-save-preset"
                >
                  Save
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="presets" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-[300px] border rounded-md">
              <div className="p-2 space-y-2">
                {!presetsData?.presets || presetsData.presets.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No presets saved. Create one from the Allocate tab.
                  </div>
                ) : (
                  presetsData.presets.map(preset => (
                    <div 
                      key={preset.id} 
                      className="flex items-center gap-2 p-3 border rounded-md bg-card hover-elevate"
                      data-testid={`preset-${preset.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{preset.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {preset.players.map(p => `${p.firstName} ${p.lastName}`).join(", ")}
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {preset.playerIds.length} players
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => loadPreset(preset)}
                        data-testid={`button-load-preset-${preset.id}`}
                      >
                        Load
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deletePresetMutation.mutate(preset.id)}
                        disabled={deletePresetMutation.isPending}
                        data-testid={`button-delete-preset-${preset.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
            Cancel
          </Button>
          <Button 
            onClick={handleRedeem}
            disabled={redeemMutation.isPending || totalAllocated === 0}
            data-testid="button-confirm-vest"
          >
            {redeemMutation.isPending ? "Vesting..." : `Vest ${totalAllocated.toLocaleString()} Shares`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
