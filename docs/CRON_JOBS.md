# Cron Job Runbook

This document describes all scheduled jobs, their purposes, and manual execution.

## Job Schedule Overview

Jobs run in Eastern Time (ET). The scheduler is initialized in `server/jobs/scheduler.ts`.

| Job Name | Schedule | Purpose |
|----------|----------|---------|
| `update_contest_statuses` | Every 5 min (`:01`) | Updates contest statuses based on game times |
| `settle_contests` | Every 5 min (`:02`) | Settles completed contests and pays winners |
| `bot_engine` | Every 1-10 min | Simulates market activity via bot trades |
| `vesting_accrual` | Every 5 min (`:04`) | Accrues vesting shares for users |
| `news_fetch` | Every hour (`:00`) | Fetches sports news from Perplexity |
| `roster_sync` | Daily 5:30 AM | Syncs NBA player roster from MySportsFeeds |
| `schedule_sync` | Every hour (`:05`) | Syncs NBA game schedules |
| `stats_sync` | Every hour (`:10`) | Syncs NBA game stats for completed games |
| `stats_sync_live` | **Every 5 min** | **Unified live stats for ALL sports (NBA+NFL)** |
| `create_contests` | Daily 00:20 | Creates contests for upcoming games |
| `daily_snapshot` | Daily 1:30 AM | Creates daily market/rank snapshots |
| `weekly_roundup` | Monday 6:00 AM | Generates weekly performance summaries |
| `nfl_roster_sync` | Daily 4:30 AM | Syncs NFL players from Ball Don't Lie |
| `nfl_schedule_sync` | Daily 6:45 AM | Syncs NFL game schedules |

---

## Manual Job Execution

Jobs can be triggered via the admin panel or CLI.

### Via CLI

```bash
# Trigger a specific job
npx tsx -e "
import 'dotenv/config';
import { syncNFLSchedule } from './server/jobs/sync-nfl-schedule';
syncNFLSchedule().then(r => console.log('Result:', r));
"
```

### Common Jobs to Trigger

```bash
# NFL Schedule (updates game statuses)
npx tsx -e "import 'dotenv/config'; import { syncNFLSchedule } from './server/jobs/sync-nfl-schedule'; syncNFLSchedule().then(console.log);"

# Unified Live Stats (NBA + NFL)
npx tsx -e "import 'dotenv/config'; import { syncAllLiveStats } from './server/jobs/sync-all-live-stats'; syncAllLiveStats().then(console.log);"

# Create Contests
npx tsx -e "import 'dotenv/config'; import { createContests } from './server/jobs/create-contests'; createContests().then(console.log);"
```

---

## Job Dependencies

```
nfl_roster_sync (4:30 AM)
    └─── nfl_schedule_sync (6:45 AM)
              └─── stats_sync_live (every 5 min)
                        └─── settle_contests (every 5 min)

roster_sync (5:30 AM)
    └─── schedule_sync (hourly)
              └─── stats_sync_live (every 5 min)
                        └─── settle_contests (every 5 min)
```

---

## Monitoring

### Check Job Logs

```sql
-- Recent job executions
SELECT job_name, status, started_at, completed_at, error_message
FROM job_execution_logs
ORDER BY started_at DESC
LIMIT 20;

-- Failed jobs in last 24 hours
SELECT job_name, error_message, started_at
FROM job_execution_logs
WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours';
```

### Debug Output

Jobs log to console with prefixes:
- `[stats_sync_live]` - Unified live stats
- `[NFL Stats Sync]` - NFL stats processing
- `[NFL Schedule Sync]` - NFL schedule updates

---

## Troubleshooting

### Job not running
1. Check if enabled in `scheduler.ts`
2. Verify cron expression is correct
3. Check for overlapping job locks

### Job failing silently
1. Check `job_execution_logs` table
2. Review console logs for error messages
3. Manually trigger job and observe output

### NFL scores not updating
1. Trigger `nfl_schedule_sync` first (updates statuses)
2. Then trigger `stats_sync_live` (fetches scores)
3. Check debug logs for game status breakdown
