import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Star, Activity, Search, ShoppingCart, Trophy, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import type { Trade, ContestEntry } from "@shared/schema";

export function OnboardingMissions() {
    const { user, isLoading: userLoading } = useAuth();
    const [isExpanded, setIsExpanded] = useState(false);

    // Mission tracking queries
    const { data: trades, isLoading: tradesLoading } = useQuery<any[]>({
        queryKey: ["/api/trades/history"],
        enabled: !!user
    });

    const { data: contestEntries, isLoading: entriesLoading } = useQuery<ContestEntry[]>({
        queryKey: ["/api/contests/entries"],
        enabled: !!user
    });

    const { data: watchList, isLoading: watchlistLoading } = useQuery<string[]>({
        queryKey: ["/api/watchlist"],
        enabled: !!user
    });

    const missions = [
        {
            id: "vest",
            title: "Claim the Vault",
            description: "Start your first vest and claim free shares.",
            icon: <Activity className="w-4 h-4" />,
            completed: (user?.totalSharesVested || 0) > 0,
            link: "/#vault"
        },
        {
            id: "watchlist",
            title: "Follow the Pros",
            description: "Add a player to your watch list.",
            icon: <Search className="w-4 h-4" />,
            completed: (watchList?.length || 0) > 0,
            link: "/marketplace"
        },
        {
            id: "trade",
            title: "Make a Move",
            description: "Buy your first shares on the exchange.",
            icon: <ShoppingCart className="w-4 h-4" />,
            completed: (trades?.filter((t: any) => t.activityType === 'trade')?.length || 0) > 0,
            link: "/marketplace"
        },
        {
            id: "compete",
            title: "Enter the Arena",
            description: "Join your first contest to win prizes.",
            icon: <Trophy className="w-4 h-4" />,
            completed: (contestEntries?.length || 0) > 0,
            link: "/contests"
        }
    ];

    // Check loading states
    const isLoading =
        (userLoading === undefined) || // user object is available from context immediately if auth is done, but let's be safe
        tradesLoading ||
        entriesLoading ||
        watchlistLoading;

    if (isLoading) return null;

    const completedCount = missions.filter(m => m.completed).length;
    const progress = (completedCount / missions.length) * 100;

    if (completedCount === missions.length) return null;

    return (
        <Card className="border border-primary/20 bg-card overflow-hidden relative shadow-lg rounded-lg">
            <CardHeader
                className="py-3 px-4 cursor-pointer select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1 rounded-lg bg-primary/10 text-primary">
                            <Star className="w-4 h-4 fill-primary" />
                        </div>
                        <CardTitle className="text-sm font-bold tracking-tight">Rookie Missions</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px] text-primary border-primary/30 bg-primary/5">
                            {completedCount}/{missions.length}
                        </Badge>
                        {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                    </div>
                </div>

                {/* Compact progress bar visible when collapsed */}
                {!isExpanded && (
                    <div className="mt-2">
                        <Progress value={progress} className="h-1 bg-muted/50">
                            <div
                                className="h-full bg-primary transition-all duration-500 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </Progress>
                    </div>
                )}
            </CardHeader>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <CardContent className="px-4 pb-4 pt-0 space-y-3">
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                    <span>Career Progress</span>
                                    <span>{Math.round(progress)}%</span>
                                </div>
                                <Progress value={progress} className="h-1.5 bg-muted/50">
                                    <div
                                        className="h-full bg-primary transition-all duration-500 ease-out"
                                        style={{ width: `${progress}%` }}
                                    />
                                </Progress>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                                {missions.map((mission, idx) => (
                                    <motion.div
                                        key={mission.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                    >
                                        <Link href={mission.link}>
                                            <div
                                                className={`group p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${mission.completed
                                                    ? "bg-primary/5 border-primary/10 opacity-70"
                                                    : "bg-muted/20 border-white/5 hover:border-primary/30 hover:bg-muted/30"
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`p-1.5 rounded-md ${mission.completed ? "bg-primary/15 text-primary" : "bg-card text-muted-foreground group-hover:text-primary transition-colors border border-white/5"
                                                        }`}>
                                                        {mission.icon}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <h4 className="text-[13px] font-semibold leading-none">{mission.title}</h4>
                                                        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{mission.description}</p>
                                                    </div>
                                                </div>
                                                {mission.completed ? (
                                                    <CheckCircle2 className="w-4 h-4 text-primary" />
                                                ) : (
                                                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                                                )}
                                            </div>
                                        </Link>
                                    </motion.div>
                                ))}
                            </div>
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}
