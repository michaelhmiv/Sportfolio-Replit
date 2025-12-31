import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, TrendingUp, TrendingDown, Trophy, DollarSign, BarChart3, ExternalLink, Clock, RefreshCw, Zap, Loader2 } from "lucide-react";
import { useNewsNotifications } from "@/lib/news-notification-context";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { authenticatedFetch } from "@/lib/queryClient";
import { PlayerLinkedText } from "@/components/player-linked-text";

interface NewsItem {
    id: string;
    headline: string;
    briefing: string;
    sourceUrl: string | null;
    sport: string;
    createdAt: string;
}

interface DigestSection {
    title: string;
    items: Array<{
        label: string;
        value: string;
        change?: string;
        isPositive?: boolean;
    }>;
}

interface Digest {
    userId: string;
    generatedAt: string;
    sections: DigestSection[];
}

export default function NewsPage() {
    const [activeTab, setActiveTab] = useState("general");
    const { isAuthenticated, user } = useAuth();
    const { markNewsAsRead, refreshUnreadCount } = useNewsNotifications();
    const { toast } = useToast();
    const isAdmin = user?.isAdmin || false;

    // Mark news as read when user visits the page (clears notification badge)
    useEffect(() => {
        if (isAuthenticated) {
            markNewsAsRead();
        }
    }, [isAuthenticated, markNewsAsRead]);

    // Fetch general news
    const { data: newsData, isLoading: newsLoading, refetch: refetchNews } = useQuery<{ news: NewsItem[] }>({
        queryKey: ['/api/news'],
    });

    // Fetch personalized digest (only for authenticated users)
    const { data: digestData, isLoading: digestLoading, refetch: refetchDigest } = useQuery<{ digest: Digest }>({
        queryKey: ['/api/news/digest'],
        enabled: isAuthenticated,
    });

    // Admin: Trigger news fetch job
    const triggerNewsFetch = useMutation({
        mutationFn: async () => {
            const response = await authenticatedFetch('/api/admin/jobs/news_fetch/trigger', {
                method: 'POST',
            });
            if (!response.ok) throw new Error('Failed to trigger news fetch');
            return response.json();
        },
        onSuccess: (data) => {
            let title = "News Fetch Complete";
            let description = "";
            let variant: "default" | "destructive" = "default";

            if (data.recordsProcessed > 0) {
                const storyText = data.recordsProcessed === 1 ? "story" : "stories";
                title = `✅ ${data.recordsProcessed} New ${storyText} Fetched!`;
                description = data.stories?.[0]?.headline
                    ? `"${data.stories[0].headline.substring(0, 55)}..."${data.recordsProcessed > 1 ? ` +${data.recordsProcessed - 1} more` : ''}`
                    : "Breaking news has been added.";
            } else if (data.error) {
                title = "⚠️ Fetch Issue";
                description = data.error;
                variant = "destructive";
            } else {
                title = "📰 Already Up-to-Date";
                description = "No new breaking news at this time.";
            }

            toast({ title, description, variant });
            refetchNews();
        },
        onError: (error: any) => {
            toast({
                title: "Fetch Failed",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    // Mark news as read when visiting
    useEffect(() => {
        if (isAuthenticated) {
            markNewsAsRead().then(() => refreshUnreadCount());
        }
    }, [isAuthenticated, markNewsAsRead, refreshUnreadCount]);

    const handleRefresh = () => {
        refetchNews();
        if (isAuthenticated) refetchDigest();
    };

    return (
        <div className="container mx-auto px-4 py-6 max-w-4xl">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <Newspaper className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">News Hub</h1>
                            <p className="text-sm text-muted-foreground">Breaking sports news & your personalized digest</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAdmin && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => triggerNewsFetch.mutate()}
                                disabled={triggerNewsFetch.isPending}
                                className="gap-2 border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/10"
                            >
                                {triggerNewsFetch.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Zap className="w-4 h-4" />
                                )}
                                Fetch Now
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="general" className="gap-2">
                            <Newspaper className="w-4 h-4" />
                            General News
                        </TabsTrigger>
                        <TabsTrigger value="digest" className="gap-2" disabled={!isAuthenticated}>
                            <BarChart3 className="w-4 h-4" />
                            Daily Digest
                        </TabsTrigger>
                    </TabsList>

                    {/* General News Tab */}
                    <TabsContent value="general" className="space-y-4">
                        {newsLoading ? (
                            <div className="space-y-4">
                                {[...Array(3)].map((_, i) => (
                                    <Card key={i}>
                                        <CardHeader>
                                            <Skeleton className="h-4 w-3/4" />
                                            <Skeleton className="h-3 w-1/2" />
                                        </CardHeader>
                                        <CardContent>
                                            <Skeleton className="h-12 w-full" />
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : newsData?.news?.length ? (
                            <div className="space-y-4">
                                {newsData.news.map((item, index) => (
                                    <motion.div
                                        key={item.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                    >
                                        <Card className="hover:shadow-md transition-shadow">
                                            <CardHeader className="pb-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <Badge
                                                                variant="secondary"
                                                                className={item.sport === 'NFL' ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'}
                                                            >
                                                                {item.sport}
                                                            </Badge>
                                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                                                            </span>
                                                        </div>
                                                        <CardTitle className="text-lg leading-tight">
                                                            <PlayerLinkedText text={item.headline} />
                                                        </CardTitle>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="pt-2">
                                                <PlayerLinkedText text={item.briefing} className="text-sm text-muted-foreground mb-3 block" />
                                                {item.sourceUrl && (
                                                    <a
                                                        href={item.sourceUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                        Source
                                                    </a>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <Card>
                                <CardContent className="py-12 text-center">
                                    <Newspaper className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                                    <h3 className="font-semibold mb-1">No News Yet</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Breaking sports news will appear here. Check back soon!
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* Daily Digest Tab */}
                    <TabsContent value="digest" className="space-y-4">
                        {!isAuthenticated ? (
                            <Card>
                                <CardContent className="py-12 text-center">
                                    <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                                    <h3 className="font-semibold mb-1">Sign In Required</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Sign in to see your personalized daily digest.
                                    </p>
                                </CardContent>
                            </Card>
                        ) : digestLoading ? (
                            <div className="space-y-4">
                                {[...Array(3)].map((_, i) => (
                                    <Card key={i}>
                                        <CardHeader>
                                            <Skeleton className="h-4 w-1/4" />
                                        </CardHeader>
                                        <CardContent>
                                            <Skeleton className="h-20 w-full" />
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : digestData?.digest?.sections?.length ? (
                            <div className="space-y-4">
                                {digestData.digest.sections.map((section, sIndex) => (
                                    <motion.div
                                        key={section.title}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: sIndex * 0.1 }}
                                    >
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-md flex items-center gap-2">
                                                    {section.title === 'Contest Results' && <Trophy className="w-4 h-4 text-yellow-500" />}
                                                    {section.title === 'Portfolio Health' && <DollarSign className="w-4 h-4 text-green-500" />}
                                                    {section.title === 'Vesting Activity' && <BarChart3 className="w-4 h-4 text-purple-500" />}
                                                    {section.title === 'Market Movers' && <TrendingUp className="w-4 h-4 text-blue-500" />}
                                                    {section.title}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="pt-2">
                                                <div className="space-y-2">
                                                    {section.items.map((item, iIndex) => (
                                                        <div key={iIndex} className="flex items-center justify-between py-2 border-b last:border-0">
                                                            <PlayerLinkedText text={item.label} className="text-sm font-medium" />
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm text-muted-foreground">{item.value}</span>
                                                                {item.change && (
                                                                    <Badge
                                                                        variant="secondary"
                                                                        className={item.isPositive
                                                                            ? 'bg-green-500/10 text-green-500'
                                                                            : 'bg-red-500/10 text-red-500'
                                                                        }
                                                                    >
                                                                        {item.isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                                                        {item.change}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                ))}
                                <p className="text-xs text-center text-muted-foreground">
                                    Last generated: {formatDistanceToNow(new Date(digestData.digest.generatedAt), { addSuffix: true })}
                                </p>
                            </div>
                        ) : (
                            <Card>
                                <CardContent className="py-12 text-center">
                                    <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                                    <h3 className="font-semibold mb-1">No Digest Available</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Your personalized digest will be generated daily at 6 AM ET.
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>
            </motion.div>
        </div>
    );
}
