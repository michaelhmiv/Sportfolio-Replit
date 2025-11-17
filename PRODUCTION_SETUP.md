# Production Background Jobs Setup Guide

This guide explains how to set up automated background jobs for your published Sportfolio site using **Replit Scheduled Deployments**.

## Why Scheduled Deployments?

Replit Scheduled Deployments are purpose-built for running automated tasks at predetermined intervals. They're perfect for Sportfolio's background jobs like syncing NBA data, creating contests, and settling winnings.

## Required Background Jobs

Your Sportfolio app requires these automated jobs:

1. **create_contests** - Creates new contests daily for upcoming NBA games
2. **settle_contests** - Settles completed contests and distributes winnings
3. **schedule_sync** - Updates game schedules and live scores
4. **stats_sync** - Syncs completed game statistics
5. **roster_sync** - Updates NBA player roster

## Setup Instructions

### Step 1: Set Up Environment Variables

Before creating scheduled deployments, ensure your production deployment has these secrets configured:

1. **ADMIN_API_TOKEN** - Used for authenticating scheduled job triggers
   - Generate a secure random string (at least 32 characters)
   - Add it to your deployment's environment variables/secrets
   
2. **MYSPORTSFEEDS_API_KEY** - Your MySportsFeeds API key
   - Get this from MySportsFeeds dashboard
   - Add it to your deployment's environment variables/secrets

3. **DATABASE_URL** - Your production database connection string
   - This should already be configured by Replit

### Step 2: Get Your Deployment URL

Your published deployment URL should look like:
```
https://your-repl-name.replit.app
```

You'll need this URL for setting up the scheduled deployments.

### Step 3: Create Scheduled Deployments

In your Replit workspace, go to the **Publishing** tool and create **5 Scheduled Deployments** (one for each job):

#### Deployment 1: Create Contests

- **Name:** Create Contests
- **Description:** Creates new contests daily for upcoming NBA games
- **Schedule:** `daily at midnight` (or use cron: `0 0 * * *`)
- **Run Command:**
  ```bash
  curl -X POST https://your-repl-name.replit.app/api/admin/jobs/trigger \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_API_TOKEN" \
    -d '{"jobName": "create_contests"}'
  ```
- **Timeout:** 5 minutes

#### Deployment 2: Settle Contests

- **Name:** Settle Contests
- **Description:** Settles completed contests and distributes winnings
- **Schedule:** `every 5 minutes` (or use cron: `*/5 * * * *`)
- **Run Command:**
  ```bash
  curl -X POST https://your-repl-name.replit.app/api/admin/jobs/trigger \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_API_TOKEN" \
    -d '{"jobName": "settle_contests"}'
  ```
- **Timeout:** 5 minutes

#### Deployment 3: Schedule Sync

- **Name:** Schedule Sync
- **Description:** Updates game schedules and live scores
- **Schedule:** `every minute` (or use cron: `* * * * *`)
- **Run Command:**
  ```bash
  curl -X POST https://your-repl-name.replit.app/api/admin/jobs/trigger \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_API_TOKEN" \
    -d '{"jobName": "schedule_sync"}'
  ```
- **Timeout:** 3 minutes

#### Deployment 4: Stats Sync

- **Name:** Stats Sync
- **Description:** Syncs completed game statistics
- **Schedule:** `every hour` (or use cron: `0 * * * *`)
- **Run Command:**
  ```bash
  curl -X POST https://your-repl-name.replit.app/api/admin/jobs/trigger \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_API_TOKEN" \
    -d '{"jobName": "stats_sync"}'
  ```
- **Timeout:** 10 minutes

#### Deployment 5: Roster Sync

- **Name:** Roster Sync
- **Description:** Updates NBA player roster
- **Schedule:** `daily at 5am` (or use cron: `0 5 * * *`)
- **Run Command:**
  ```bash
  curl -X POST https://your-repl-name.replit.app/api/admin/jobs/trigger \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_API_TOKEN" \
    -d '{"jobName": "roster_sync"}'
  ```
- **Timeout:** 10 minutes

**Important Notes:**
- Replace `your-repl-name.replit.app` with your actual deployment URL
- The `$ADMIN_API_TOKEN` environment variable will be automatically available in scheduled deployments
- Each deployment needs access to the same environment variables/secrets as your main deployment

### Step 4: Test Your Setup

After creating the scheduled deployments:

1. Manually trigger one of them to test (use the "Run now" button in Replit)
2. Check the execution logs to ensure it completed successfully
3. Visit the `/admin` page on your site to verify the job ran
4. Look for updated data (new contests, game scores, etc.)

### Step 5: Monitor Your Jobs

Replit provides built-in monitoring for scheduled deployments:

- View execution history and logs in the Publishing workspace
- Set up error alerts to get notified of failures
- Check the `/admin` page on your site for job status and statistics

## Manual Trigger via Admin Panel

Admin users can manually trigger jobs through the web interface:

1. Log into your Sportfolio site as an admin user
2. Visit your profile page
3. Click the "Admin" button (only visible to admin users)
4. View system stats and use job trigger buttons to run jobs manually

**Security Model:**
- Admin panel access requires the `isAdmin` flag to be set to `true` in the users table
- Scheduled deployments and external services use token-based authentication (`ADMIN_API_TOKEN`)
- To grant admin access to a user, run: `UPDATE users SET is_admin = true WHERE id = 'user_id';`

## Troubleshooting

### Job Returns 401 Unauthorized

**Cause:** Authentication failed

**Fix:**
- Verify `ADMIN_API_TOKEN` is set in your deployment environment variables
- Ensure the token matches in both your main deployment and scheduled deployments
- Check that the Authorization header includes "Bearer " prefix

### Job Returns 503 Service Unavailable

**Cause:** `ADMIN_API_TOKEN` environment variable is not configured

**Fix:**
- Add `ADMIN_API_TOKEN` to your deployment's environment variables/secrets
- Redeploy your application

### Contests Not Appearing

**Causes:**
- `create_contests` job hasn't run yet
- MySportsFeeds API is not accessible
- No upcoming NBA games scheduled

**Fix:**
- Manually trigger `create_contests` job first
- Verify `MYSPORTSFEEDS_API_KEY` is set in production secrets
- Check job logs for API errors

### Games Not Updating

**Causes:**
- `schedule_sync` job is not running frequently enough
- MySportsFeeds API rate limiting

**Fix:**
- Ensure `schedule_sync` is scheduled to run every minute
- Check job execution logs for errors
- Verify you're within MySportsFeeds API rate limits

### Job Timeout

**Causes:**
- Job takes longer than configured timeout
- Database queries are slow
- MySportsFeeds API is slow

**Fix:**
- Increase the timeout duration for that scheduled deployment
- Check database performance and indexes
- Review job logs to identify bottlenecks

## Cost

Replit Scheduled Deployments are included with Replit Core:
- You receive monthly credits to offset costs
- Default configuration: 1vCPU / 2 GiB RAM
- Jobs automatically terminate after completion (no continuous charges)

With 5 scheduled deployments running at the frequencies above, costs are minimal and well within typical Replit Core credits.

## Security Best Practices

Your `ADMIN_API_TOKEN` acts as authentication for job triggers:

1. **Generate a strong token** - Use at least 32 random characters
2. **Keep it secure** - Never commit it to version control
3. **Rotate periodically** - Update the token every few months
4. **Use HTTPS only** - Replit provides this automatically
5. **Monitor access** - Check admin endpoint logs for unauthorized attempts

## Advanced: Direct Job Execution (Alternative)

If you prefer, you can create a Node.js script that directly calls job functions instead of using HTTP endpoints:

**trigger-job.js:**
```javascript
import { runJob } from './server/jobs/scheduler.js';

const jobName = process.argv[2];
if (!jobName) {
  console.error('Usage: node trigger-job.js <job_name>');
  process.exit(1);
}

runJob(jobName)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Job failed:', err);
    process.exit(1);
  });
```

Then use this command in scheduled deployments:
```bash
node trigger-job.js create_contests
```

This approach bypasses HTTP entirely and runs jobs directly in the scheduled deployment environment.
