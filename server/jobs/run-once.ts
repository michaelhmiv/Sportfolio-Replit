#!/usr/bin/env tsx
/**
 * CLI tool to manually trigger cron jobs for testing and verification
 * 
 * Usage:
 *   tsx server/jobs/run-once.ts roster_sync
 *   tsx server/jobs/run-once.ts schedule_sync
 *   tsx server/jobs/run-once.ts stats_sync
 */

import { syncRoster } from "./sync-roster";
import { syncSchedule } from "./sync-schedule";
import { syncStats } from "./sync-stats";
import type { JobResult } from "./scheduler";

const VALID_JOBS = {
  roster_sync: syncRoster,
  schedule_sync: syncSchedule,
  stats_sync: syncStats,
} as const;

async function runJob(jobName: string) {
  if (!(jobName in VALID_JOBS)) {
    console.error(`Invalid job name: ${jobName}`);
    console.error(`Valid jobs: ${Object.keys(VALID_JOBS).join(', ')}`);
    process.exit(1);
  }

  const handler = VALID_JOBS[jobName as keyof typeof VALID_JOBS];
  
  console.log(`\n=== Running ${jobName} ===\n`);
  const startTime = Date.now();
  
  try {
    const result: JobResult = await handler();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n=== ${jobName} completed in ${duration}s ===`);
    console.log(`Records processed: ${result.recordsProcessed}`);
    console.log(`Errors: ${result.errorCount}`);
    console.log(`API requests: ${result.requestCount}`);
    
    if (result.errorCount > 0) {
      console.warn('\nJob completed with errors - check logs above');
      process.exit(1);
    } else {
      console.log('\n✓ Job completed successfully');
      process.exit(0);
    }
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`\n=== ${jobName} FAILED after ${duration}s ===`);
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Parse command line args
const jobName = process.argv[2];

if (!jobName) {
  console.error('Usage: tsx server/jobs/run-once.ts <job_name>');
  console.error(`Valid jobs: ${Object.keys(VALID_JOBS).join(', ')}`);
  process.exit(1);
}

runJob(jobName);
