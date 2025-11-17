import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
  schedule_sync: "Update game schedules and live scores",
  stats_sync: "Sync completed game statistics",
  create_contests: "Generate contests for upcoming games",
  settle_contests: "Settle completed contests and distribute winnings",
};

export default function Admin() {
  const { toast } = useToast();
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());

  const { data: stats, isLoading } = useQuery<SystemStats>({
    queryKey: ["/api/admin/stats"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const triggerJobMutation = useMutation({
    mutationFn: async (jobName: string) => {
      const res = await apiRequest("POST", "/api/admin/jobs/trigger", { jobName });
      return await res.json();
    },
    onMutate: (jobName) => {
      setRunningJobs(prev => new Set(prev).add(jobName));
    },
    onSuccess: (data, jobName) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: "Job completed",
        description: `${jobName}: ${data.result.recordsProcessed} records processed, ${data.result.errorCount} errors`,
      });
    },
    onError: (error: any, jobName) => {
      toast({
        title: "Job failed",
        description: error.message || `Failed to run ${jobName}`,
        variant: "destructive",
      });
    },
    onSettled: (_, __, jobName) => {
      setRunningJobs(prev => {
        const next = new Set(prev);
        next.delete(jobName);
        return next;
      });
    },
  });

  const handleTriggerJob = (jobName: string) => {
    triggerJobMutation.mutate(jobName);
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
