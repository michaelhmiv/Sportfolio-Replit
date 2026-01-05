
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import {
    TrendingUp,
    TrendingDown,
    Flame,
    Activity,
    ArrowRight,
    TicketPercent,
    BarChart3,
    HelpCircle
} from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import type { Player } from "@shared/schema";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { useSport } from "@/lib/sport-context";
import { Button } from "@/components/ui/button";

// Simplified type for the API response
interface ScannerResponse {
    undervalued: { player: Player, metrics: { valueIndex: number } }[];
    premium: { player: Player, metrics: { valueIndex: number } }[];
    sentiment: { player: Player, metrics: { sentiment: { buyPressure: number } } }[];
    momentum: { player: Player, metrics: any }[];
}

// --- Reusable Data Hook ---
function useScannerData() {
    const { sport } = useSport();

    const { data: scanData, isLoading: scanLoading } = useQuery<ScannerResponse>({
        queryKey: ["/api/market/scanners", sport], // Includes sport in key
        queryFn: async () => {
            const res = await fetch(`/api/market/scanners?sport=${sport}`);
            if (!res.ok) throw new Error("Failed");
            return res.json();
        },
        refetchInterval: 60000,
    });

    const { data: topRisers, isLoading: risersLoading } = useQuery<any[]>({
        queryKey: ["/api/players/spotlight/top-risers", sport, "limit-10"],
        queryFn: async () => {
            const res = await fetch(`/api/players/spotlight/top-risers?sport=${sport}&limit=10`);
            if (!res.ok) throw new Error("Failed");
            return res.json();
        },
    });

    const { data: topMc, isLoading: mcLoading } = useQuery<any[]>({
        queryKey: ["/api/players/spotlight/top-market-cap", sport, "limit-10"],
        queryFn: async () => {
            const res = await fetch(`/api/players/spotlight/top-market-cap?sport=${sport}&limit=10`);
            if (!res.ok) throw new Error("Failed");
            return res.json();
        },
    });

    return {
        scanData,
        topRisers,
        topMc,
        isLoading: scanLoading || risersLoading || mcLoading
    };
}

// --- Main Marketplace Component (Grid on Desktop, Carousel on Mobile) ---
export function MarketplaceScanners() {
    const { scanData, topRisers, topMc, isLoading } = useScannerData();

    if (isLoading) return <ScannerSkeleton />;
    if (!scanData) return null;

    return (
        <>
            {/* Mobile: Carousel */}
            <div className="block md:hidden mb-6 -mx-4 px-4">
                <ScannerCarousel
                    scanData={scanData}
                    topRisers={topRisers}
                    topMc={topMc}
                    mode="compact"
                />
            </div>

            {/* Desktop: Grid */}
            <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <DesktopScannerGrid scanData={scanData} />
            </div>
        </>
    );
}

// --- Dashboard Component (Grid on Desktop, Carousel on Mobile) ---
export function DashboardScanners() {
    const { scanData, topRisers, topMc, isLoading } = useScannerData();

    if (isLoading) return <ScannerSkeleton />;
    if (!scanData) return null;

    const descriptions: Record<string, string> = {
        undervalued: "Players priced significantly below their calculated fair value based on recent performance.",
        risers: "Players with the highest percentage price increase over the last 24 hours.",
        marketcap: "Top players ranked by total market capitalization (Price × Total Shares)."
    };

    const sections = [
        {
            title: "Relative Price/FPS",
            icon: <TicketPercent className="w-4 h-4 text-emerald-500" />,
            color: { border: "border-emerald-500/20", bg: "bg-emerald-500/10", text: "text-emerald-500" },
            items: scanData.undervalued,
            type: "undervalued"
        },
        {
            title: "Top Gainers (24h)",
            icon: <TrendingUp className="w-4 h-4 text-green-500" />,
            color: { border: "border-green-500/20", bg: "bg-green-500/10", text: "text-green-500" },
            items: topRisers,
            type: "risers"
        },
        {
            title: "Market Cap Leaders",
            icon: <BarChart3 className="w-4 h-4 text-blue-500" />,
            color: { border: "border-blue-500/20", bg: "bg-blue-500/10", text: "text-blue-500" },
            items: topMc,
            type: "marketcap"
        }
    ];

    return (
        <div className="mb-6">
            {/* Mobile/Tablet: Carousel */}
            <div className="lg:hidden -mx-4 px-4">
                <ScannerCarousel
                    scanData={scanData}
                    topRisers={topRisers}
                    topMc={topMc}
                    mode="expanded"
                />
            </div>

            {/* Desktop: 3-column Grid */}
            <div className="hidden lg:grid grid-cols-3 gap-6">
                {sections.map((section, idx) => (
                    <div key={idx} className={`border rounded-lg overflow-hidden bg-card h-full flex flex-col ${section.color.border}`}>
                        <div className={`p-3 border-b flex items-center justify-between ${section.color.bg}`}>
                            <div className="flex items-center gap-2 font-bold text-sm">
                                {section.icon}
                                {section.title}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-4 w-4 rounded-full p-0 hover:bg-transparent">
                                            <HelpCircle className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent side="top" className="w-64 p-2">
                                        <p className="text-xs">{descriptions[section.type]}</p>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        <div className="p-2 flex-1 space-y-1">
                            {section.items?.slice(0, 5).map((item: any, i: number) => {
                                const player = item.player || item;
                                let value = "";
                                let label = "";

                                if (section.type === "undervalued") {
                                    value = item.metrics?.valueIndex?.toFixed(0);
                                    label = "Index";
                                } else if (section.type === "risers") {
                                    value = `+$${item.priceChange24h?.toFixed(2)}`;
                                    label = "Change";
                                } else if (section.type === "marketcap") {
                                    const cap = item.marketCap || 0;
                                    value = `$${cap < 1000000 ? (cap / 1000).toFixed(0) + 'k' : (cap / 1000000).toFixed(1) + 'M'}`;
                                    label = "Cap";
                                }

                                return (
                                    <ScannerRowExpanded
                                        key={player.id}
                                        rank={i + 1}
                                        player={player}
                                        label={label}
                                        value={value}
                                        color={section.color.text}
                                        type={section.type}
                                    />
                                );
                            })}
                        </div>

                        <div className="p-2 border-t bg-muted/20 text-center">
                            <Link href="/marketplace">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full h-6 text-[10px] uppercase text-muted-foreground"
                                >
                                    View Full List <ArrowRight className="w-3 h-3 ml-1" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// --- Shared Carousel Component ---
function ScannerCarousel({ scanData, topRisers, topMc, mode }: { scanData: ScannerResponse, topRisers?: any[], topMc?: any[], mode: 'compact' | 'expanded' }) {
    const [, setLocation] = useLocation();
    const descriptions: Record<string, string> = {
        undervalued: "Players priced significantly below their calculated fair value based on recent performance.",
        risers: "Players with the highest percentage price increase over the last 24 hours.",
        marketcap: "Top players ranked by total market capitalization (Price × Total Shares).",
        sentiment: "Players with the strongest buying pressure (Buy Volume vs Sell Volume).",
        premium: "Exclusive premium shares that grant special platform benefits and rewards."
    };

    const Slide = ({ title, icon, color, items, type }: any) => {
        const isExpanded = mode === "expanded";

        return (
            <CarouselItem className={`${isExpanded ? "basis-[95%] lg:basis-[48%]" : "basis-[85%]"} pl-4`}>
                <div className={`border rounded-lg overflow-hidden bg-card h-full flex flex-col ${color.border}`}>
                    <div className={`p-3 border-b flex items-center justify-between ${color.bg}`}>
                        <div className="flex items-center gap-2 font-bold text-sm">
                            {icon}
                            {title}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-4 w-4 rounded-full p-0 hover:bg-transparent">
                                        <HelpCircle className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent side="top" className="w-64 p-2">
                                    <p className="text-xs">{descriptions[type]}</p>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    {/* Content List */}
                    <div className={`p-2 flex-1 overflow-y-auto ${isExpanded ? "space-y-1" : "grid grid-cols-2 gap-2"}`}>
                        {items?.slice(0, isExpanded ? 10 : 6).map((item: any, i: number) => {
                            // Normalize data for rendering
                            const player = item.player || item;

                            // Determine display values based on type
                            let value = "";
                            let label = "";

                            if (type === "undervalued") {
                                value = item.metrics?.valueIndex?.toFixed(0);
                                label = "Index";
                            } else if (type === "risers") {
                                value = `+$${item.priceChange24h?.toFixed(2)}`;
                                label = "Change";
                            } else if (type === "marketcap") {
                                const cap = item.marketCap || 0;
                                value = `$${cap < 1000000 ? (cap / 1000).toFixed(0) + 'k' : (cap / 1000000).toFixed(1) + 'M'}`;
                                label = "Cap";
                            } else if (type === "sentiment") {
                                value = `${item.metrics?.sentiment?.buyPressure?.toFixed(0)}%`;
                                label = "Buy Vol";
                            } else if (type === "premium") {
                                value = item.metrics?.valueIndex?.toFixed(0);
                                label = "Index";
                            }

                            // Render appropriate row style
                            if (isExpanded) {
                                return (
                                    <ScannerRowExpanded
                                        key={player.id}
                                        rank={i + 1}
                                        player={player}
                                        label={label}
                                        value={value}
                                        color={color.text}
                                        type={type}
                                    />
                                );
                            } else {
                                return (
                                    <ScannerRowCompact
                                        key={player.id}
                                        rank={i + 1}
                                        player={player}
                                        label={label}
                                        value={value}
                                        color={color.text}
                                    />
                                );
                            }
                        })}
                    </div>

                    <div className="p-2 border-t bg-muted/20 text-center">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full h-6 text-[10px] uppercase text-muted-foreground"
                            onClick={() => {
                                const url =
                                    type === "risers" ? "/marketplace?sortBy=change&sortOrder=desc" :
                                        type === "marketcap" ? "/marketplace?sortBy=marketCap&sortOrder=desc" :
                                            type === "sentiment" ? "/marketplace?sortBy=sentiment&sortOrder=desc" :
                                                type === "undervalued" ? "/marketplace?sortBy=undervalued&sortOrder=asc" :
                                                    "/marketplace";

                                setLocation(url);
                                // Delayed scroll to ensure page state updates first if needed
                                setTimeout(() => {
                                    document.getElementById('all-players')?.scrollIntoView({ behavior: 'smooth' });
                                }, 100);
                            }}
                        >
                            View Full List <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                    </div>
                </div>
            </CarouselItem>
        );
    };

    return (
        <Carousel opts={{ align: "start", loop: false }} className="w-full">
            <CarouselContent className="-ml-4 pb-2">
                <Slide
                    title="Relative Price/FPS"
                    icon={<TicketPercent className="w-4 h-4 text-emerald-500" />}
                    color={{ border: "border-emerald-500/20", bg: "bg-emerald-500/10", text: "text-emerald-500" }}
                    items={scanData.undervalued}
                    type="undervalued"
                />
                <Slide
                    title="Top Gainers (24h)"
                    icon={<TrendingUp className="w-4 h-4 text-green-500" />}
                    color={{ border: "border-green-500/20", bg: "bg-green-500/10", text: "text-green-500" }}
                    items={topRisers}
                    type="risers"
                />
                <Slide
                    title="Market Cap Leaders"
                    icon={<BarChart3 className="w-4 h-4 text-blue-500" />}
                    color={{ border: "border-blue-500/20", bg: "bg-blue-500/10", text: "text-blue-500" }}
                    items={topMc}
                    type="marketcap"
                />
            </CarouselContent>
            {/* Show controls on Dashboard/Expanded mode only */}
            {mode === 'expanded' && (
                <>
                    <CarouselPrevious className="left-[-12px] h-8 w-8 hidden md:flex" />
                    <CarouselNext className="right-[-12px] h-8 w-8 hidden md:flex" />
                </>
            )}
        </Carousel>
    );
}

// --- Desktop Grid Component (Legacy implementation) ---
function DesktopScannerGrid({ scanData }: { scanData: ScannerResponse }) {
    // Transform data for Top Gainers (sorted by 24h price change)
    const topRisers = scanData.momentum
        .filter((item) => parseFloat(item.player.priceChange24h) > 0)
        .sort((a, b) => parseFloat(b.player.priceChange24h) - parseFloat(a.player.priceChange24h))
        .slice(0, 6);

    // Transform data for Market Cap Leaders
    const topMc = [...scanData.undervalued, ...scanData.momentum]
        .filter((item, index, self) => self.findIndex(t => t.player.id === item.player.id) === index)
        .sort((a, b) => parseFloat(b.player.marketCap?.toString() || "0") - parseFloat(a.player.marketCap?.toString() || "0"))
        .slice(0, 6);

    return (
        <>
            {/* 📊 Relative Price/FPS */}
            <ScannerCard
                title="Relative Price/FPS"
                icon={<TicketPercent className="w-4 h-4 text-emerald-500" />}
                colorConfig={{ border: "border-emerald-500/20", bg: "bg-emerald-500/5", hover: "hover:border-emerald-500/40", badge: "" }}
            >
                {scanData.undervalued.slice(0, 5).map((item, i) => (
                    <ScannerRow
                        key={item.player.id}
                        rank={i + 1}
                        player={item.player}
                        metricLabel="Index"
                        metricValue={item.metrics.valueIndex.toFixed(0)}
                        metricColor="text-emerald-500"
                    />
                ))}
            </ScannerCard>

            {/* 📈 Top Gainers (24h) */}
            <ScannerCard
                title="Top Gainers (24h)"
                icon={<TrendingUp className="w-4 h-4 text-green-500" />}
                colorConfig={{ border: "border-green-500/20", bg: "bg-green-500/5", hover: "hover:border-green-500/40", badge: "" }}
            >
                {topRisers.slice(0, 5).map((item, i) => (
                    <ScannerRow
                        key={item.player.id}
                        rank={i + 1}
                        player={item.player}
                        metricLabel="24h"
                        metricValue={`+${parseFloat(item.player.priceChange24h).toFixed(1)}%`}
                        metricColor="text-green-500"
                    />
                ))}
            </ScannerCard>

            {/* 🏆 Market Cap Leaders */}
            <ScannerCard
                title="Market Cap Leaders"
                icon={<BarChart3 className="w-4 h-4 text-blue-500" />}
                colorConfig={{ border: "border-blue-500/20", bg: "bg-blue-500/5", hover: "hover:border-blue-500/40", badge: "" }}
            >
                {topMc.slice(0, 5).map((item, i) => (
                    <ScannerRow
                        key={item.player.id}
                        rank={i + 1}
                        player={item.player}
                        metricLabel="Mkt Cap"
                        metricValue={`$${(parseFloat(item.player.marketCap?.toString() || "0") / 1000000).toFixed(1)}M`}
                        metricColor="text-blue-500"
                    />
                ))}
            </ScannerCard>
        </>
    )
}

// --- Row Variants ---

function ScannerRowExpanded({ rank, player, label, value, color, type }: any) {
    return (
        <Link href={`/player/${player.id}`}>
            <div className="flex items-center justify-between p-2 hover:bg-muted/50 rounded cursor-pointer transition-colors group/row border border-transparent hover:border-border/50">
                <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
                    <span className="text-xs font-mono font-bold w-5 text-muted-foreground/50 text-center">{rank}</span>

                    {/* Player Info */}
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold truncate group-hover/row:text-primary transition-colors">
                            {player.firstName} {player.lastName}
                        </span>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] h-4 px-1 py-0">{player.team}</Badge>
                            <span className="text-[10px] text-muted-foreground">{player.position}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6 text-right">
                    {/* Price */}
                    <div className="flex flex-col items-end w-16">
                        <span className="text-sm font-mono font-bold">${parseFloat(player.currentPrice || player.price || "0").toFixed(2)}</span>
                        <span className="text-[10px] text-muted-foreground uppercase opacity-50">Price</span>
                    </div>

                    {/* Metric */}
                    <div className="flex flex-col items-end w-16">
                        <span className={`text-sm font-bold ${color}`}>{value}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-tighter opacity-70">{label}</span>
                    </div>

                    <ArrowRight className="w-4 h-4 text-muted-foreground/50 opacity-0 group-hover/row:opacity-100 -ml-2" />
                </div>
            </div>
        </Link >
    )
}

function ScannerRowCompact({ rank, player, label, value, color }: any) {
    return (
        <Link href={`/player/${player.id}`}>
            <div className="flex items-center gap-2 bg-muted/20 rounded p-1.5 hover:bg-muted cursor-pointer transition-colors border border-transparent hover:border-border h-full">
                <span className="text-[9px] font-mono text-muted-foreground w-3 text-center flex-shrink-0">{rank}</span>

                <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                    <span className="text-[11px] font-bold truncate">{player.lastName}</span>
                    <span className="text-[9px] text-muted-foreground uppercase truncate flex-shrink-0">{player.team}</span>
                </div>

                <div className="flex flex-col items-end flex-shrink-0 leading-none">
                    <span className={`text-[10px] font-bold ${color}`}>{value}</span>
                    <span className="text-[8px] text-muted-foreground uppercase scale-90 origin-right">{label}</span>
                </div>
            </div>
        </Link>
    );
}

function ScannerCard({ title, icon, colorConfig, children }: any) {
    return (
        <Card className={`transition-all duration-300 ${colorConfig.border} ${colorConfig.hover} overflow-hidden group rounded-lg`}>
            <CardHeader className="p-3 pb-2 border-b border-border/50">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        {icon}
                        {title}
                    </CardTitle>
                    <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                    {children}
                </div>
            </CardContent>
        </Card>
    );
}

function ScannerRow({ rank, player, metricLabel, metricValue, metricColor }: any) {
    return (
        <Link href={`/player/${player.id}`}>
            <div className="flex items-center justify-between p-2 hover:bg-muted/50 cursor-pointer transition-colors group/row">
                <div className="flex items-center gap-3 overflow-hidden">
                    <span className={`text-xs font-mono font-bold w-4 text-muted-foreground/50`}>
                        {rank}
                    </span>
                    <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold truncate group-hover/row:text-primary transition-colors">
                            {player.firstName.charAt(0)}. {player.lastName}
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase">{player.team} • {player.position}</span>
                    </div>
                </div>

                <div className="flex flex-col items-end">
                    <span className={`text-xs font-bold ${metricColor}`}>
                        {metricValue}
                    </span>
                    <span className="text-[9px] text-muted-foreground uppercase tracking-tighter">
                        {metricLabel}
                    </span>
                </div>
            </div>
        </Link>
    );
}

function ScannerSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map(i => (
                <Card key={i} className="h-48">
                    <CardHeader className="p-3">
                        <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent className="p-3 space-y-3">
                        {[1, 2, 3, 4, 5].map(j => (
                            <Skeleton key={j} className="h-6 w-full" />
                        ))}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
