import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Star, Plus, Trash2, Edit2, Users, ChevronRight, X, Search, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, authenticatedFetch } from "@/lib/queryClient";
import { Link } from "wouter";
import { PlayerName } from "@/components/player-name";
import type { Player } from "@shared/schema";

interface Watchlist {
    id: string;
    name: string;
    isDefault: boolean;
    color: string | null;
    itemCount: number;
}

export default function Watchlists() {
    const { user, isAuthenticated } = useAuth();
    const { toast } = useToast();
    const [newListName, setNewListName] = useState("");
    const [editingList, setEditingList] = useState<Watchlist | null>(null);
    const [editName, setEditName] = useState("");
    const [expandedListId, setExpandedListId] = useState<string | null>(null);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [addPlayerDialogOpen, setAddPlayerDialogOpen] = useState(false);
    const [addToWatchlistId, setAddToWatchlistId] = useState<string | null>(null);
    const [playerSearch, setPlayerSearch] = useState("");

    // Fetch all watchlists
    const { data: watchlists, isLoading, refetch } = useQuery<Watchlist[]>({
        queryKey: ["/api/watchlists"],
        enabled: isAuthenticated,
    });

    // Fetch player IDs in expanded watchlist
    const { data: watchlistPlayerIds, refetch: refetchPlayerIds } = useQuery<string[]>({
        queryKey: ["/api/watchlists", expandedListId, "items"],
        queryFn: async () => {
            if (!expandedListId) return [];
            const res = await authenticatedFetch(`/api/watchlists/${expandedListId}/items`);
            if (!res.ok) return [];
            return res.json();
        },
        enabled: !!expandedListId,
    });

    // Fetch all players (for display and search)
    const { data: allPlayersData } = useQuery<{ players: Player[] }>({
        queryKey: ["/api/players", { limit: 500 }],
        queryFn: async () => {
            const res = await fetch("/api/players?limit=500");
            if (!res.ok) return { players: [] };
            return res.json();
        },
    });

    // Get players that are in the expanded watchlist
    const expandedPlayers = useMemo(() => {
        if (!watchlistPlayerIds?.length || !allPlayersData?.players) return [];
        return allPlayersData.players.filter(p => watchlistPlayerIds.includes(p.id));
    }, [watchlistPlayerIds, allPlayersData?.players]);

    // Filtered players for add dialog
    const searchResults = useMemo(() => {
        if (!playerSearch.trim() || !allPlayersData?.players) return [];
        const search = playerSearch.toLowerCase();
        return allPlayersData.players
            .filter(p =>
                `${p.firstName} ${p.lastName}`.toLowerCase().includes(search) ||
                p.team?.toLowerCase().includes(search)
            )
            .slice(0, 10);
    }, [playerSearch, allPlayersData?.players]);

    // Create watchlist mutation
    const createMutation = useMutation({
        mutationFn: async (name: string) => {
            const res = await authenticatedFetch("/api/watchlists", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            if (!res.ok) throw new Error("Failed to create watchlist");
            return res.json();
        },
        onSuccess: () => {
            refetch();
            setNewListName("");
            setCreateDialogOpen(false);
            toast({ title: "Watchlist created" });
        },
        onError: () => {
            toast({ title: "Failed to create watchlist", variant: "destructive" });
        },
    });

    // Update watchlist mutation
    const updateMutation = useMutation({
        mutationFn: async ({ id, name }: { id: string; name: string }) => {
            const res = await authenticatedFetch(`/api/watchlists/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            if (!res.ok) throw new Error("Failed to update watchlist");
        },
        onSuccess: () => {
            refetch();
            setEditDialogOpen(false);
            setEditingList(null);
            toast({ title: "Watchlist updated" });
        },
        onError: () => {
            toast({ title: "Failed to update watchlist", variant: "destructive" });
        },
    });

    // Delete watchlist mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await authenticatedFetch(`/api/watchlists/${id}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete watchlist");
        },
        onSuccess: () => {
            refetch();
            if (expandedListId) setExpandedListId(null);
            toast({ title: "Watchlist deleted" });
        },
        onError: () => {
            toast({ title: "Failed to delete watchlist", variant: "destructive" });
        },
    });

    // Add player to watchlist
    const addPlayerMutation = useMutation({
        mutationFn: async ({ playerId, watchlistId }: { playerId: string; watchlistId: string }) => {
            const res = await authenticatedFetch(`/api/watchlist/${playerId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ watchlistId }),
            });
            if (!res.ok) throw new Error("Failed to add player");
            return res.json();
        },
        onSuccess: () => {
            refetch();
            refetchPlayerIds();
            queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
            toast({ title: "Player added to watchlist" });
        },
        onError: () => {
            toast({ title: "Failed to add player", variant: "destructive" });
        },
    });

    // Remove player from watchlist
    const removePlayerMutation = useMutation({
        mutationFn: async ({ playerId, watchlistId }: { playerId: string; watchlistId: string }) => {
            const res = await authenticatedFetch(`/api/watchlist/${playerId}?watchlistId=${watchlistId}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to remove player");
        },
        onSuccess: () => {
            refetch();
            refetchPlayerIds();
            queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
            toast({ title: "Player removed from watchlist" });
        },
        onError: () => {
            toast({ title: "Failed to remove player", variant: "destructive" });
        },
    });

    const openAddPlayerDialog = (watchlistId: string) => {
        setAddToWatchlistId(watchlistId);
        setPlayerSearch("");
        setAddPlayerDialogOpen(true);
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-background p-4">
                <div className="max-w-4xl mx-auto">
                    <Card>
                        <CardContent className="p-8 text-center">
                            <Star className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                            <h2 className="text-xl font-bold mb-2">Sign in to view your watchlists</h2>
                            <p className="text-muted-foreground mb-4">
                                Create and manage custom watchlists to track your favorite players.
                            </p>
                            <Button asChild>
                                <Link href="/login">Sign In</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-3 sm:p-4">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <Star className="w-6 h-6 text-primary" />
                        <h1 className="text-xl sm:text-2xl font-bold">Your Watchlists</h1>
                    </div>

                    <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="w-4 h-4 mr-2" />
                                New List
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create New Watchlist</DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                <Input
                                    placeholder="Watchlist name"
                                    value={newListName}
                                    onChange={(e) => setNewListName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && newListName.trim()) {
                                            createMutation.mutate(newListName.trim());
                                        }
                                    }}
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => createMutation.mutate(newListName.trim())}
                                    disabled={!newListName.trim() || createMutation.isPending}
                                >
                                    {createMutation.isPending ? "Creating..." : "Create"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                {isLoading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <Card key={i} className="animate-pulse">
                                <CardContent className="p-4">
                                    <div className="h-6 bg-muted rounded w-32" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : !watchlists?.length ? (
                    <Card>
                        <CardContent className="p-8 text-center">
                            <Star className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                            <h2 className="text-lg font-bold mb-2">No watchlists yet</h2>
                            <p className="text-muted-foreground mb-4">
                                Create your first watchlist to start tracking players.
                            </p>
                            <Button onClick={() => setCreateDialogOpen(true)}>
                                <Plus className="w-4 h-4 mr-2" />
                                Create Watchlist
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {watchlists.map((list) => (
                            <Card key={list.id} className={list.isDefault ? "border-primary/30" : ""}>
                                <CardHeader className="p-4 pb-0">
                                    <div className="flex items-center justify-between">
                                        <div
                                            className="flex items-center gap-3 flex-1 cursor-pointer"
                                            onClick={() => setExpandedListId(expandedListId === list.id ? null : list.id)}
                                        >
                                            <div className={`p-2 rounded-lg ${list.isDefault ? "bg-primary/10" : "bg-muted"}`}>
                                                <Star className={`w-4 h-4 ${list.isDefault ? "text-primary fill-primary" : "text-muted-foreground"}`} />
                                            </div>
                                            <div>
                                                <CardTitle className="text-base flex items-center gap-2">
                                                    {list.name}
                                                    {list.isDefault && (
                                                        <Badge variant="outline" className="text-xs">Default</Badge>
                                                    )}
                                                </CardTitle>
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                                    <Users className="w-3 h-3" />
                                                    <span>{list.itemCount} player{list.itemCount !== 1 ? "s" : ""}</span>
                                                </div>
                                            </div>
                                            <ChevronRight className={`w-4 h-4 text-muted-foreground ml-auto transition-transform ${expandedListId === list.id ? "rotate-90" : ""}`} />
                                        </div>

                                        <div className="flex items-center gap-1 ml-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                title="Add player"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openAddPlayerDialog(list.id);
                                                }}
                                            >
                                                <UserPlus className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingList(list);
                                                    setEditName(list.name);
                                                    setEditDialogOpen(true);
                                                }}
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            {!list.isDefault && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteMutation.mutate(list.id);
                                                    }}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>

                                {expandedListId === list.id && (
                                    <CardContent className="p-4 pt-3">
                                        {!expandedPlayers?.length ? (
                                            <div className="text-center py-4 text-sm text-muted-foreground">
                                                No players in this watchlist.{" "}
                                                <button
                                                    onClick={() => openAddPlayerDialog(list.id)}
                                                    className="text-primary hover:underline"
                                                >
                                                    Add players
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {expandedPlayers.map((player) => (
                                                    <div
                                                        key={player.id}
                                                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                                    >
                                                        <Link href={`/player/${player.id}`} className="flex items-center gap-3 flex-1">
                                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                                <span className="font-bold text-xs">
                                                                    {player.firstName?.[0]}{player.lastName?.[0]}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <PlayerName
                                                                    playerId={player.id}
                                                                    firstName={player.firstName}
                                                                    lastName={player.lastName}
                                                                    className="text-sm font-medium"
                                                                />
                                                                <div className="text-xs text-muted-foreground">
                                                                    {player.team} • {player.position}
                                                                </div>
                                                            </div>
                                                        </Link>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => removePlayerMutation.mutate({ playerId: player.id, watchlistId: list.id })}
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ))}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full mt-2"
                                                    onClick={() => openAddPlayerDialog(list.id)}
                                                >
                                                    <Plus className="w-4 h-4 mr-2" />
                                                    Add more players
                                                </Button>
                                            </div>
                                        )}
                                    </CardContent>
                                )}
                            </Card>
                        ))}
                    </div>
                )}

                {/* Edit Dialog */}
                <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Edit Watchlist</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                            <Input
                                placeholder="Watchlist name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && editName.trim() && editingList) {
                                        updateMutation.mutate({ id: editingList.id, name: editName.trim() });
                                    }
                                }}
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => editingList && updateMutation.mutate({ id: editingList.id, name: editName.trim() })}
                                disabled={!editName.trim() || updateMutation.isPending}
                            >
                                {updateMutation.isPending ? "Saving..." : "Save"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Add Player Dialog */}
                <Dialog open={addPlayerDialogOpen} onOpenChange={setAddPlayerDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Add Player to Watchlist</DialogTitle>
                        </DialogHeader>
                        <div className="py-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search players..."
                                    value={playerSearch}
                                    onChange={(e) => setPlayerSearch(e.target.value)}
                                    className="pl-10"
                                    autoFocus
                                />
                            </div>

                            <div className="mt-3 max-h-64 overflow-y-auto space-y-1">
                                {playerSearch.trim() === "" ? (
                                    <p className="text-center text-sm text-muted-foreground py-4">
                                        Type to search for players
                                    </p>
                                ) : searchResults.length === 0 ? (
                                    <p className="text-center text-sm text-muted-foreground py-4">
                                        No players found
                                    </p>
                                ) : (
                                    searchResults.map((player) => (
                                        <div
                                            key={player.id}
                                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                                            onClick={() => {
                                                if (addToWatchlistId) {
                                                    addPlayerMutation.mutate({ playerId: player.id, watchlistId: addToWatchlistId });
                                                }
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                    <span className="font-bold text-xs">
                                                        {player.firstName?.[0]}{player.lastName?.[0]}
                                                    </span>
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium">
                                                        {player.firstName} {player.lastName}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {player.team} • {player.position} • {player.sport}
                                                    </div>
                                                </div>
                                            </div>
                                            <Plus className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setAddPlayerDialogOpen(false)}>
                                Done
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
