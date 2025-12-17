import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { LiveLogViewer } from "@/components/live-log-viewer";
import { Switch } from "@/components/ui/switch";
import {
  Settings,
  RefreshCw,
  Calendar,
  TrendingUp,
  Trophy,
  Users,
  Database,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Download,
  FileText,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Send,
  Twitter,
  Sparkles,
  AlertCircle,
} from "lucide-react";

interface SystemStats {
  totalUsers: number;
  totalPlayers: number;
  totalContests: number;
  openContests: number;
  liveContests: number;
  completedContests: number;
  apiRequestsToday: number;
  lastJobRuns: {
    jobName: string;
    status: string;
    finishedAt: string | null;
    recordsProcessed: number;
    errorCount: number;
  }[];
}

const jobDescriptions = {
  roster_sync: "Sync NBA player roster from MySportsFeeds",
  sync_player_game_logs: "Cache all player game logs with pre-calculated fantasy points",
  schedule_sync: "Update game schedules and live scores",
  stats_sync: "Sync completed game statistics",
  create_contests: "Generate contests for upcoming games",
  settle_contests: "Settle completed contests and distribute winnings",
};

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  publishedAt: string | null;
  createdAt: string;
}

interface TweetSettings {
  id: number;
  enabled: boolean;
  promptTemplate: string | null;
  includeRisers: boolean;
  includeVolume: boolean;
  includeMarketCap: boolean;
  maxPlayers: number;
  updatedAt: string;
}

interface TweetHistory {
  id: number;
  content: string;
  tweetId: string | null;
  status: string;
  error: string | null;
  createdAt: string;
}

interface TweetData {
  settings: TweetSettings;
  history: TweetHistory[];
  status: {
    twitter: { configured: boolean; ready: boolean };
    perplexity: { configured: boolean; ready: boolean };
  };
}

interface TweetPreview {
  content: string;
  playerData: any;
  aiSummary: string | null;
  characterCount: number;
  settings: TweetSettings;
}

export default function Admin() {
  const { toast } = useToast();
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [backfillStartDate, setBackfillStartDate] = useState("2025-11-17");
  const [backfillEndDate, setBackfillEndDate] = useState("2025-11-21");
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillOperationId, setBackfillOperationId] = useState<string | null>(null);
  const [jobOperationIds, setJobOperationIds] = useState<Map<string, string>>(new Map());
  
  // Blog post state
  const [blogDialogOpen, setBlogDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [blogTitle, setBlogTitle] = useState("");
  const [blogSlug, setBlogSlug] = useState("");
  const [blogExcerpt, setBlogExcerpt] = useState("");
  const [blogContent, setBlogContent] = useState("");
  const [blogPublished, setBlogPublished] = useState(false);

  // Tweet automation state
  const [tweetPreview, setTweetPreview] = useState<TweetPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [customDraft, setCustomDraft] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);

  // Premium grant state
  const [grantUsername, setGrantUsername] = useState("");
  const [grantQuantity, setGrantQuantity] = useState("");

  const { data: stats, isLoading } = useQuery<SystemStats>({
    queryKey: ["/api/admin/stats"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const triggerJobMutation = useMutation({
    mutationFn: async ({ jobName, operationId }: { jobName: string; operationId: string }) => {
      const res = await apiRequest("POST", "/api/admin/jobs/trigger", { jobName, operationId });
      return await res.json();
    },
    onMutate: ({ jobName, operationId }) => {
      setRunningJobs(prev => new Set(prev).add(jobName));
      setJobOperationIds(prev => new Map(prev).set(jobName, operationId));
    },
    onSuccess: (data, { jobName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: data.status === 'degraded' ? "Job completed with errors" : "Job completed",
        description: `${jobName}: ${data.result.recordsProcessed} records processed, ${data.result.errorCount} errors`,
        variant: data.status === 'degraded' ? 'destructive' : undefined,
      });
    },
    onError: (error: any, { jobName }) => {
      toast({
        title: "Job failed",
        description: error.message || `Failed to run ${jobName}`,
        variant: "destructive",
      });
    },
    onSettled: (_, __, { jobName }) => {
      setRunningJobs(prev => {
        const next = new Set(prev);
        next.delete(jobName);
        return next;
      });
    },
  });

  const handleTriggerJob = (jobName: string) => {
    const operationId = `job-${jobName}-${Date.now()}`;
    triggerJobMutation.mutate({ jobName, operationId });
  };

  const backfillMutation = useMutation({
    mutationFn: async ({ startDate, endDate, operationId }: { startDate: string; endDate: string; operationId: string }) => {
      const res = await apiRequest("POST", "/api/admin/backfill", { startDate, endDate, operationId });
      return await res.json();
    },
    onMutate: ({ operationId }) => {
      setIsBackfilling(true);
      setBackfillOperationId(operationId);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      
      const variant = data.status === 'degraded' ? 'default' : 'default';
      toast({
        title: data.status === 'degraded' ? "Backfill completed with errors" : "Backfill completed",
        description: `${data.result.recordsProcessed} game logs cached, ${data.result.errorCount} errors, ${data.result.requestCount} API requests`,
        variant: data.status === 'degraded' ? 'destructive' : undefined,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Backfill failed",
        description: error.message || "Failed to run backfill",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsBackfilling(false);
    },
  });

  const handleBackfill = () => {
    if (!backfillStartDate || !backfillEndDate) {
      toast({
        title: "Invalid dates",
        description: "Please select both start and end dates",
        variant: "destructive",
      });
      return;
    }
    
    // Generate unique operation ID
    const operationId = `backfill-${Date.now()}`;
    backfillMutation.mutate({ startDate: backfillStartDate, endDate: backfillEndDate, operationId });
  };

  // Blog posts query
  const { data: blogPostsData } = useQuery<{ posts: BlogPost[]; total: number }>({
    queryKey: ["/api/admin/blog"],
  });

  // Tweet data query
  const { data: tweetData, refetch: refetchTweets } = useQuery<TweetData>({
    queryKey: ["/api/admin/tweets"],
    refetchInterval: 60000,
  });

  // Tweet mutations
  const updateTweetSettingsMutation = useMutation({
    mutationFn: async (data: Partial<TweetSettings>) => {
      const res = await apiRequest("PATCH", "/api/admin/tweets/settings", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tweets"] });
      toast({ title: "Settings updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update settings", description: error.message, variant: "destructive" });
    },
  });

  const handlePreviewTweet = async () => {
    setIsPreviewLoading(true);
    try {
      const res = await apiRequest("POST", "/api/admin/tweets/preview", {});
      const data = await res.json();
      setTweetPreview(data);
    } catch (error: any) {
      toast({ title: "Preview failed", description: error.message, variant: "destructive" });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handlePostTweet = async () => {
    setIsPosting(true);
    try {
      const res = await apiRequest("POST", "/api/admin/tweets/post", {});
      const data = await res.json();
      if (data.success) {
        toast({ title: "Tweet posted!", description: `Tweet ID: ${data.tweetId}` });
        setTweetPreview(null);
        refetchTweets();
      } else {
        toast({ title: "Failed to post", description: data.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Failed to post", description: error.message, variant: "destructive" });
    } finally {
      setIsPosting(false);
    }
  };

  const handleTestTwitter = async () => {
    try {
      const res = await apiRequest("POST", "/api/admin/tweets/test-twitter", {});
      const data = await res.json();
      toast({
        title: data.success ? "Twitter connected!" : "Twitter connection failed",
        description: data.username ? `Logged in as @${data.username}` : data.error,
        variant: data.success ? undefined : "destructive",
      });
    } catch (error: any) {
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    }
  };

  const handleTestPerplexity = async () => {
    try {
      const res = await apiRequest("POST", "/api/admin/tweets/test-perplexity", {});
      const data = await res.json();
      toast({
        title: data.success ? "Perplexity connected!" : "Perplexity connection failed",
        description: data.success ? "API key is valid" : data.error,
        variant: data.success ? undefined : "destructive",
      });
    } catch (error: any) {
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    }
  };

  const handleDraftCustomTweet = async () => {
    if (!customPrompt.trim()) {
      toast({ title: "Enter a prompt", description: "Describe what you want to tweet about", variant: "destructive" });
      return;
    }
    setIsDrafting(true);
    try {
      const res = await apiRequest("POST", "/api/admin/tweets/draft", { prompt: customPrompt });
      const data = await res.json();
      if (data.success) {
        setCustomDraft(data.content);
        toast({ title: "Draft ready!", description: "Review and edit before posting" });
      } else {
        toast({ title: "Draft failed", description: data.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Draft failed", description: error.message, variant: "destructive" });
    } finally {
      setIsDrafting(false);
    }
  };

  const handlePostCustomDraft = async () => {
    if (!customDraft) return;
    setIsPosting(true);
    try {
      const res = await apiRequest("POST", "/api/admin/tweets/post", { customContent: customDraft });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Tweet posted!", description: `Tweet ID: ${data.tweetId}` });
        setCustomDraft(null);
        setCustomPrompt("");
        refetchTweets();
      } else {
        toast({ title: "Failed to post", description: data.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Failed to post", description: error.message, variant: "destructive" });
    } finally {
      setIsPosting(false);
    }
  };

  // Premium grant mutation
  const grantPremiumMutation = useMutation({
    mutationFn: async (data: { username: string; quantity: number }) => {
      const res = await apiRequest("POST", "/api/admin/premium/grant", data);
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Premium shares granted",
        description: `Granted ${data.granted} shares to ${data.user.username} (${data.previousQuantity} → ${data.newQuantity})`,
      });
      setGrantUsername("");
      setGrantQuantity("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to grant shares",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGrantPremium = () => {
    if (!grantUsername.trim()) {
      toast({ title: "Username required", variant: "destructive" });
      return;
    }
    const qty = parseInt(grantQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "Quantity must be a positive number", variant: "destructive" });
      return;
    }
    grantPremiumMutation.mutate({ username: grantUsername.trim(), quantity: qty });
  };

  // Blog mutations
  const createBlogPostMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/blog", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
      setBlogDialogOpen(false);
      resetBlogForm();
      toast({
        title: "Blog post created",
        description: "Your blog post has been created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create post",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateBlogPostMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/blog/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
      setBlogDialogOpen(false);
      resetBlogForm();
      toast({
        title: "Blog post updated",
        description: "Your blog post has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update post",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteBlogPostMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/blog/${id}`, {});
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog"] });
      toast({
        title: "Blog post deleted",
        description: "The blog post has been deleted",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete post",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetBlogForm = () => {
    setBlogTitle("");
    setBlogSlug("");
    setBlogExcerpt("");
    setBlogContent("");
    setBlogPublished(false);
    setEditingPost(null);
  };

  const handleOpenBlogDialog = (post?: BlogPost) => {
    if (post) {
      setEditingPost(post);
      setBlogTitle(post.title);
      setBlogSlug(post.slug);
      setBlogExcerpt(post.excerpt);
      setBlogContent(post.content);
      setBlogPublished(!!post.publishedAt);
    } else {
      resetBlogForm();
    }
    setBlogDialogOpen(true);
  };

  const handleSaveBlogPost = () => {
    if (!blogTitle || !blogSlug || !blogExcerpt || !blogContent) {
      toast({
        title: "Validation error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const data = {
      title: blogTitle,
      slug: blogSlug,
      excerpt: blogExcerpt,
      content: blogContent,
      publishedAt: blogPublished ? new Date().toISOString() : null,
    };

    if (editingPost) {
      updateBlogPostMutation.mutate({ id: editingPost.id, data });
    } else {
      createBlogPostMutation.mutate(data);
    }
  };

  const handleDeleteBlogPost = (id: string) => {
    if (confirm("Are you sure you want to delete this blog post?")) {
      deleteBlogPostMutation.mutate(id);
    }
  };

  // Auto-generate slug from title
  const handleTitleChange = (value: string) => {
    setBlogTitle(value);
    if (!editingPost) {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      setBlogSlug(slug);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-3 sm:p-6 lg:p-8 flex items-center justify-center">
        <div className="text-muted-foreground">Loading admin panel...</div>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-positive" />;
      case "degraded":
        return <Activity className="w-4 h-4 text-yellow-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-positive/10 text-positive border-positive/20">Success</Badge>;
      case "degraded":
        return <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">Degraded</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Settings className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Admin Panel</h1>
            <p className="text-muted-foreground">System management and monitoring</p>
          </div>
        </div>

        {/* System Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-total-users">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Total Users</span>
              </div>
              <div className="text-2xl font-bold">{stats?.totalUsers.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-total-players">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">NBA Players</span>
              </div>
              <div className="text-2xl font-bold">{stats?.totalPlayers.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-total-contests">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Total Contests</span>
              </div>
              <div className="text-2xl font-bold">{stats?.totalContests.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {stats?.openContests} open, {stats?.liveContests} live
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-api-requests">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">API Requests</span>
              </div>
              <div className="text-2xl font-bold">{stats?.apiRequestsToday.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">Today</div>
            </CardContent>
          </Card>
        </div>

        {/* Premium Shares Grant */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Grant Premium Shares
            </CardTitle>
            <CardDescription>
              Manually grant premium shares to a user by username.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="grant-username">Username</Label>
                  <Input
                    id="grant-username"
                    type="text"
                    placeholder="Enter username"
                    value={grantUsername}
                    onChange={(e) => setGrantUsername(e.target.value)}
                    disabled={grantPremiumMutation.isPending}
                    data-testid="input-grant-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grant-quantity">Quantity</Label>
                  <Input
                    id="grant-quantity"
                    type="number"
                    min="1"
                    placeholder="Number of shares"
                    value={grantQuantity}
                    onChange={(e) => setGrantQuantity(e.target.value)}
                    disabled={grantPremiumMutation.isPending}
                    data-testid="input-grant-quantity"
                  />
                </div>
              </div>
              <Button
                onClick={handleGrantPremium}
                disabled={grantPremiumMutation.isPending}
                className="gap-2"
                data-testid="button-grant-premium"
              >
                {grantPremiumMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Granting...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Grant Shares
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Backfill Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Game Logs Backfill
            </CardTitle>
            <CardDescription>
              Manually backfill game logs for a specific date range. The daily cron job only fetches yesterday's games. Use this for initial setup or catching up after downtime.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="backfill-start-date">Start Date</Label>
                  <Input
                    id="backfill-start-date"
                    type="date"
                    value={backfillStartDate}
                    onChange={(e) => setBackfillStartDate(e.target.value)}
                    disabled={isBackfilling}
                    data-testid="input-backfill-start-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="backfill-end-date">End Date</Label>
                  <Input
                    id="backfill-end-date"
                    type="date"
                    value={backfillEndDate}
                    onChange={(e) => setBackfillEndDate(e.target.value)}
                    disabled={isBackfilling}
                    data-testid="input-backfill-end-date"
                  />
                </div>
              </div>
              <Button
                onClick={handleBackfill}
                disabled={isBackfilling}
                className="gap-2"
                data-testid="button-run-backfill"
              >
                {isBackfilling ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Running Backfill...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Run Backfill
                  </>
                )}
              </Button>
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                <strong>Note:</strong> Backfilling is slow (~5-10 minutes for full season). Each date requires a 5-second API call. The daily cron job completes in ~5 seconds since it only fetches yesterday.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live Log Viewer for Backfill */}
        {backfillOperationId && (
          <LiveLogViewer
            operationId={backfillOperationId}
            title="Backfill Game Logs - Live Status"
            description="Real-time progress and logs from the backfill operation"
            onComplete={() => {
              setBackfillOperationId(null);
            }}
          />
        )}

        {/* Job Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Background Jobs
            </CardTitle>
            <CardDescription>
              Manually trigger background sync jobs. In production, these should run via external cron service.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(jobDescriptions).map(([jobName, description]) => (
              <div key={jobName} className="flex items-center justify-between p-4 rounded-lg border">
                <div className="flex-1">
                  <div className="font-semibold font-mono text-sm mb-1">{jobName}</div>
                  <div className="text-sm text-muted-foreground">{description}</div>
                </div>
                <Button
                  onClick={() => handleTriggerJob(jobName)}
                  disabled={runningJobs.has(jobName)}
                  size="sm"
                  className="gap-2"
                  data-testid={`button-trigger-${jobName}`}
                >
                  {runningJobs.has(jobName) ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Run Now
                    </>
                  )}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Live Log Viewers for Triggered Jobs */}
        {Array.from(jobOperationIds.entries()).map(([jobName, operationId]) => (
          <LiveLogViewer
            key={operationId}
            operationId={operationId}
            title={`${jobName} - Live Status`}
            description={`Real-time progress and logs from ${jobName} job`}
            onComplete={() => {
              setJobOperationIds(prev => {
                const next = new Map(prev);
                next.delete(jobName);
                return next;
              });
            }}
          />
        ))}

        {/* Blog Posts Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                <div>
                  <CardTitle>Blog Posts</CardTitle>
                  <CardDescription>Manage blog content for SEO and user engagement</CardDescription>
                </div>
              </div>
              <Dialog open={blogDialogOpen} onOpenChange={setBlogDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2" onClick={() => handleOpenBlogDialog()} data-testid="button-create-blog-post">
                    <Plus className="w-4 h-4" />
                    New Post
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingPost ? "Edit Blog Post" : "Create Blog Post"}</DialogTitle>
                    <DialogDescription>
                      {editingPost ? "Update your blog post content" : "Create a new blog post for Sportfolio"}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="blog-title">Title</Label>
                      <Input
                        id="blog-title"
                        placeholder="Enter blog post title"
                        value={blogTitle}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        data-testid="input-blog-title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="blog-slug">Slug (URL)</Label>
                      <Input
                        id="blog-slug"
                        placeholder="url-friendly-slug"
                        value={blogSlug}
                        onChange={(e) => setBlogSlug(e.target.value)}
                        data-testid="input-blog-slug"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="blog-excerpt">Excerpt</Label>
                      <Textarea
                        id="blog-excerpt"
                        placeholder="Brief summary (shown in blog listing)"
                        value={blogExcerpt}
                        onChange={(e) => setBlogExcerpt(e.target.value)}
                        rows={3}
                        data-testid="textarea-blog-excerpt"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="blog-content">Content (Markdown supported)</Label>
                      <Textarea
                        id="blog-content"
                        placeholder="Full blog post content - supports markdown formatting (headings, lists, links, bold, italic, code blocks, etc.)"
                        value={blogContent}
                        onChange={(e) => setBlogContent(e.target.value)}
                        rows={15}
                        className="font-mono text-sm"
                        data-testid="textarea-blog-content"
                      />
                      <p className="text-xs text-muted-foreground">
                        Use markdown syntax: **bold**, *italic*, # Headings, - Lists, [links](url), ```code blocks```, etc.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="blog-published"
                        type="checkbox"
                        checked={blogPublished}
                        onChange={(e) => setBlogPublished(e.target.checked)}
                        className="h-4 w-4"
                        data-testid="checkbox-blog-published"
                      />
                      <Label htmlFor="blog-published">Published (visible to public)</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setBlogDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveBlogPost} data-testid="button-save-blog-post">
                      {editingPost ? "Update" : "Create"} Post
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {blogPostsData && blogPostsData.posts.length > 0 ? (
              <div className="space-y-2">
                {blogPostsData.posts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover-elevate"
                    data-testid={`blog-post-item-${post.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm truncate">{post.title}</h3>
                        {post.publishedAt ? (
                          <Badge variant="default" className="text-xs">
                            <Eye className="w-3 h-3 mr-1" />
                            Published
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <EyeOff className="w-3 h-3 mr-1" />
                            Draft
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{post.excerpt}</p>
                      <p className="text-xs text-muted-foreground mt-1">/{post.slug}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleOpenBlogDialog(post)}
                        data-testid={`button-edit-blog-${post.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteBlogPost(post.id)}
                        data-testid={`button-delete-blog-${post.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No blog posts yet. Create your first post to improve SEO and engage users!
              </div>
            )}
          </CardContent>
        </Card>

        {/* Twitter Automation */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2">
                <Twitter className="w-5 h-5" />
                Twitter Automation
              </CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="tweet-enabled" className="text-sm">Auto-post</Label>
                <Switch
                  id="tweet-enabled"
                  checked={tweetData?.settings?.enabled ?? false}
                  onCheckedChange={(checked) => updateTweetSettingsMutation.mutate({ enabled: checked })}
                  data-testid="switch-tweet-enabled"
                />
              </div>
            </div>
            <CardDescription>Daily market tweets with AI-powered player insights</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Service Status */}
            <div className="flex flex-wrap gap-2">
              <Badge variant={tweetData?.status?.twitter?.configured ? "default" : "secondary"}>
                <Twitter className="w-3 h-3 mr-1" />
                X/Twitter: {tweetData?.status?.twitter?.configured ? "Configured" : "Not configured"}
              </Badge>
              <Badge variant={tweetData?.status?.perplexity?.configured ? "default" : "secondary"}>
                <Sparkles className="w-3 h-3 mr-1" />
                Perplexity: {tweetData?.status?.perplexity?.configured ? "Configured" : "Not configured"}
              </Badge>
            </div>

            {/* Test Connections */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleTestTwitter} data-testid="button-test-twitter">
                Test X Connection
              </Button>
              <Button size="sm" variant="outline" onClick={handleTestPerplexity} data-testid="button-test-perplexity">
                Test Perplexity
              </Button>
            </div>

            {/* Tweet Settings */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="include-risers"
                  checked={tweetData?.settings?.includeRisers ?? true}
                  onChange={(e) => updateTweetSettingsMutation.mutate({ includeRisers: e.target.checked })}
                  className="h-4 w-4"
                  data-testid="checkbox-include-risers"
                />
                <Label htmlFor="include-risers" className="text-xs">Top Risers</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="include-volume"
                  checked={tweetData?.settings?.includeVolume ?? true}
                  onChange={(e) => updateTweetSettingsMutation.mutate({ includeVolume: e.target.checked })}
                  className="h-4 w-4"
                  data-testid="checkbox-include-volume"
                />
                <Label htmlFor="include-volume" className="text-xs">Volume</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="include-marketcap"
                  checked={tweetData?.settings?.includeMarketCap ?? true}
                  onChange={(e) => updateTweetSettingsMutation.mutate({ includeMarketCap: e.target.checked })}
                  className="h-4 w-4"
                  data-testid="checkbox-include-marketcap"
                />
                <Label htmlFor="include-marketcap" className="text-xs">Market Cap</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="max-players" className="text-xs">Max Players:</Label>
                <Input
                  id="max-players"
                  type="number"
                  min={1}
                  max={5}
                  value={tweetData?.settings?.maxPlayers ?? 3}
                  onChange={(e) => updateTweetSettingsMutation.mutate({ maxPlayers: parseInt(e.target.value) || 3 })}
                  className="w-14 h-7 text-xs"
                  data-testid="input-max-players"
                />
              </div>
            </div>

            {/* Daily Tweet Actions */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Daily Auto-Tweet</h4>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handlePreviewTweet} disabled={isPreviewLoading} data-testid="button-preview-tweet">
                  {isPreviewLoading ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />}
                  Preview Daily
                </Button>
                <Button size="sm" onClick={handlePostTweet} disabled={isPosting || !tweetData?.status?.twitter?.configured} data-testid="button-post-tweet">
                  {isPosting ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                  Post Daily
                </Button>
              </div>
            </div>

            {/* Custom AI Tweet Drafting */}
            <div className="space-y-2 pt-3 border-t">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Custom AI Tweet
              </h4>
              <p className="text-xs text-muted-foreground">
                Ask Perplexity to draft a tweet using your market data + fantasy stats
              </p>
              <Textarea
                placeholder="e.g. Draft a tweet about the top 5 fantasy performers from last night's games..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={2}
                className="text-sm"
                data-testid="textarea-custom-prompt"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleDraftCustomTweet} disabled={isDrafting || !tweetData?.status?.perplexity?.configured} data-testid="button-draft-custom">
                  {isDrafting ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  Draft with AI
                </Button>
              </div>
              
              {/* Custom Draft Result */}
              {customDraft && (
                <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">AI Draft</span>
                    <Badge variant={customDraft.length <= 280 ? "default" : "destructive"} className="text-xs">
                      {customDraft.length}/280
                    </Badge>
                  </div>
                  <Textarea
                    value={customDraft}
                    onChange={(e) => setCustomDraft(e.target.value)}
                    rows={4}
                    className="text-sm font-mono"
                    data-testid="textarea-custom-draft"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handlePostCustomDraft} disabled={isPosting || customDraft.length > 280} data-testid="button-post-custom">
                      {isPosting ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                      Post This Tweet
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCustomDraft(null)}>
                      Discard
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Tweet Preview */}
            {tweetPreview && (
              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold">Preview</span>
                  <Badge variant={tweetPreview.characterCount <= 280 ? "default" : "destructive"} className="text-xs">
                    {tweetPreview.characterCount}/280
                  </Badge>
                </div>
                <pre className="text-sm whitespace-pre-wrap font-mono">{tweetPreview.content}</pre>
                {tweetPreview.aiSummary && (
                  <div className="mt-2 pt-2 border-t">
                    <span className="text-xs text-muted-foreground">AI Summary (expanded): {tweetPreview.aiSummary}</span>
                  </div>
                )}
              </div>
            )}

            {/* Recent Tweet History */}
            {tweetData?.history && tweetData.history.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Recent Tweets</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {tweetData.history.slice(0, 5).map((tweet) => (
                    <div key={tweet.id} className="flex items-center justify-between p-2 rounded border text-xs">
                      <div className="flex-1 min-w-0 mr-2">
                        <span className="truncate block">{tweet.content.slice(0, 60)}...</span>
                        <span className="text-muted-foreground">{new Date(tweet.createdAt).toLocaleString()}</span>
                      </div>
                      {tweet.status === "posted" ? (
                        <Badge variant="default" className="text-xs shrink-0">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Posted
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs shrink-0">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Failed
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Job History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent Job Runs
            </CardTitle>
            <CardDescription>Last execution status for each job</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.lastJobRuns && stats.lastJobRuns.length > 0 ? (
              <div className="space-y-3">
                {stats.lastJobRuns.map((job) => (
                  <div key={job.jobName} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(job.status)}
                      <div>
                        <div className="font-mono text-sm font-semibold">{job.jobName}</div>
                        <div className="text-xs text-muted-foreground">
                          {job.finishedAt
                            ? new Date(job.finishedAt).toLocaleString()
                            : "Never run"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right hidden sm:block">
                        <div className="text-sm">{job.recordsProcessed} records</div>
                        {job.errorCount > 0 && (
                          <div className="text-xs text-destructive">{job.errorCount} errors</div>
                        )}
                      </div>
                      {getStatusBadge(job.status)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No job history available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
