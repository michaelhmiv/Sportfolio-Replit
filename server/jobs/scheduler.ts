/**
 * Cron Job Scheduler
 * 
 * Manages automated sync jobs for MySportsFeeds data ingestion.
 * Jobs run on staggered schedules to avoid overwhelming the API.
 */

import * as cron from "node-cron";
import { storage } from "../storage";
import { syncRoster } from "./sync-roster";
import { syncSchedule } from "./sync-schedule";
import { syncStats } from "./sync-stats";
import { syncStatsLive } from "./sync-stats-live";
import { syncPlayerGameLogs } from "./sync-player-game-logs";
import { settleContests } from "./settle-contests";
import { createContests } from "./create-contests";
import { updateContestStatuses } from "./update-contest-statuses";
import { dailySnapshot } from "./daily-snapshot";
import { backfillContestStats } from "./backfill-contest-stats";
import { generateWeeklyRoundup } from "./weekly-roundup";
import type { ProgressCallback } from "../lib/admin-stream";

export interface JobResult {
  requestCount: number;
  recordsProcessed: number;
  errorCount: number;
}

export interface JobConfig {
  name: string;
  schedule: string; // Cron expression
  enabled: boolean;
  handler: () => Promise<JobResult>;
}

export class JobScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private isInitialized = false;

  constructor() {}

  /**
   * Helper method to schedule a job
   */
  private scheduleJob(jobConfig: JobConfig) {
    if (!jobConfig.enabled) {
      console.log(`Job ${jobConfig.name} is disabled, skipping...`);
      return;
    }

    const task = cron.schedule(
      jobConfig.schedule,
      async () => {
        console.log(`[${jobConfig.name}] Starting scheduled run...`);
        
        const jobLog = await storage.createJobLog({
          jobName: jobConfig.name,
          scheduledFor: new Date(),
          status: "running",
        });

        try {
          const result = await jobConfig.handler();
          
          // Determine job status: degraded if some records failed, success if all succeeded
          const status = result.errorCount > 0 ? "degraded" : "success";
          
          await storage.updateJobLog(jobLog.id, {
            status,
            finishedAt: new Date(),
            requestCount: result.requestCount || 0,
            recordsProcessed: result.recordsProcessed || 0,
            errorCount: result.errorCount || 0,
          });
          
          if (status === "degraded") {
            console.warn(`[${jobConfig.name}] Completed with errors - ${result.recordsProcessed} records processed, ${result.errorCount} failed, ${result.requestCount} requests`);
          } else {
            console.log(`[${jobConfig.name}] Completed successfully - ${result.recordsProcessed} records, ${result.requestCount} requests`);
          }
        } catch (error: any) {
          console.error(`[${jobConfig.name}] Failed:`, error.message);
          
          await storage.updateJobLog(jobLog.id, {
            status: "failed",
            errorMessage: error.message,
            finishedAt: new Date(),
          });
        }
      },
      {
        timezone: "America/New_York", // ET timezone
      }
    );

    this.jobs.set(jobConfig.name, task);
    console.log(`Job ${jobConfig.name} scheduled: ${jobConfig.schedule}`);
  }

  /**
   * Initialize contest-related jobs (database-only, no API required)
   */
  async initializeContestJobs() {
    console.log("Initializing contest jobs...");

    const contestJobs: JobConfig[] = [
      {
        name: "update_contest_statuses",
        schedule: "* * * * *", // Every minute - transition contests from open to live
        enabled: true,
        handler: updateContestStatuses,
      },
      {
        name: "settle_contests",
        schedule: "*/5 * * * *", // Every 5 minutes - check for contests to settle
        enabled: true,
        handler: settleContests,
      },
    ];

    for (const jobConfig of contestJobs) {
      this.scheduleJob(jobConfig);
    }

    console.log("Contest jobs initialized successfully");
  }

  /**
   * Initialize API-dependent jobs (requires MYSPORTSFEEDS_API_KEY)
   */
  async initializeApiJobs() {
    console.log("Initializing API-dependent jobs...");

    const apiJobs: JobConfig[] = [
      {
        name: "roster_sync",
        schedule: "0 5 * * *", // Daily at 5:00 AM ET
        enabled: true,
        handler: syncRoster,
      },
      {
        name: "sync_player_game_logs",
        schedule: "0 6 * * *", // Daily at 6:00 AM ET - after games finalize
        enabled: true,
        handler: () => syncPlayerGameLogs({ mode: 'daily' }),
      },
      {
        name: "schedule_sync",
        schedule: "0 * * * *", // Every hour for live score updates
        enabled: true,
        handler: syncSchedule,
      },
      {
        name: "stats_sync",
        schedule: "0 * * * *", // Every hour
        enabled: true,
        handler: syncStats,
      },
      {
        name: "stats_sync_live",
        schedule: "* * * * *", // Every minute for live games
        enabled: true,
        handler: syncStatsLive,
      },
      {
        name: "create_contests",
        schedule: "0 0 * * *", // Daily at midnight - create contests for upcoming games
        enabled: true,
        handler: createContests,
      },
      {
        name: "daily_snapshot",
        schedule: "0 1 * * *", // Daily at 1:00 AM ET - after contests are created
        enabled: true,
        handler: dailySnapshot,
      },
      {
        name: "weekly_roundup",
        schedule: "0 6 * * 1", // Weekly on Monday at 6:00 AM ET
        enabled: true,
        handler: generateWeeklyRoundup,
      },
    ];

    for (const jobConfig of apiJobs) {
      this.scheduleJob(jobConfig);
    }

    console.log("API-dependent jobs initialized successfully");
  }

  /**
   * Initialize all cron jobs (convenience method)
   */
  async initialize() {
    if (this.isInitialized) {
      console.log("Job scheduler already initialized");
      return;
    }

    console.log("Initializing job scheduler...");

    await this.initializeContestJobs();
    await this.initializeApiJobs();

    this.isInitialized = true;
    console.log("Job scheduler initialized successfully");
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.jobs.size === 0) {
      console.log("No jobs to start - initialize jobs first");
      return;
    }

    console.log("Starting all cron jobs...");
    Array.from(this.jobs.entries()).forEach(([name, task]) => {
      task.start();
      console.log(`Job ${name} started`);
    });
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    console.log("Stopping all cron jobs...");
    Array.from(this.jobs.entries()).forEach(([name, task]) => {
      task.stop();
      console.log(`Job ${name} stopped`);
    });
  }

  /**
   * Manually trigger a job (for testing/admin purposes)
   */
  async triggerJob(jobName: string, progressCallback?: ProgressCallback): Promise<JobResult> {
    // Job handlers with progress callback support
    const jobConfigs: Record<string, (callback?: ProgressCallback) => Promise<JobResult>> = {
      roster_sync: (callback) => syncRoster(callback),
      sync_player_game_logs: (callback) => syncPlayerGameLogs({ progressCallback: callback }),
      schedule_sync: (callback) => syncSchedule(callback),
      stats_sync: (callback) => syncStats(callback),
      stats_sync_live: (callback) => syncStatsLive(callback),
      create_contests: (callback) => createContests(callback),
      update_contest_statuses: (callback) => updateContestStatuses(callback),
      settle_contests: (callback) => settleContests(callback),
      daily_snapshot: (callback) => dailySnapshot(callback),
      backfill_contest_stats: (callback) => backfillContestStats(callback),
      weekly_roundup: (callback) => generateWeeklyRoundup(callback),
    };

    const handler = jobConfigs[jobName];
    if (!handler) {
      throw new Error(`Unknown job: ${jobName}`);
    }

    console.log(`[${jobName}] Manual trigger started${progressCallback ? ' with live logging' : ''}...`);
    
    const jobLog = await storage.createJobLog({
      jobName,
      scheduledFor: new Date(),
      status: "running",
    });

    try {
      const result = await handler(progressCallback);
      
      // Determine job status: degraded if some records failed, success if all succeeded
      const status = result.errorCount > 0 ? "degraded" : "success";
      
      await storage.updateJobLog(jobLog.id, {
        status,
        finishedAt: new Date(),
        requestCount: result.requestCount,
        recordsProcessed: result.recordsProcessed,
        errorCount: result.errorCount,
      });
      
      if (status === "degraded") {
        console.warn(`[${jobName}] Manual trigger completed with errors - ${result.recordsProcessed} records processed, ${result.errorCount} failed, ${result.requestCount} requests`);
      } else {
        console.log(`[${jobName}] Manual trigger completed - ${result.recordsProcessed} records, ${result.requestCount} requests`);
      }
      return result;
    } catch (error: any) {
      console.error(`[${jobName}] Manual trigger failed:`, error.message);
      
      await storage.updateJobLog(jobLog.id, {
        status: "failed",
        errorMessage: error.message,
        finishedAt: new Date(),
      });
      
      throw error;
    }
  }

  /**
   * Get status of all jobs
   */
  getStatus(): Array<{ name: string; running: boolean }> {
    return Array.from(this.jobs.entries()).map(([name, task]) => ({
      name,
      running: task.getStatus() === 'running',
    }));
  }
}

// Global scheduler instance
export const jobScheduler = new JobScheduler();
