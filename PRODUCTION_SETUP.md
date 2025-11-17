# Production Cron Jobs Setup Guide

This guide explains how to set up external cron jobs for your published Sportfolio site using cron-job.org (free service).

## Why External Cron Jobs?

Replit deployments don't automatically run background cron jobs. To keep your production site running smoothly, you need to set up external cron triggers that call your admin API endpoints on a schedule.

## Required Background Jobs

Your Sportfolio app requires these automated jobs:

1. **create_contests** - Creates new contests daily for upcoming NBA games
2. **settle_contests** - Settles completed contests and distributes winnings
3. **schedule_sync** - Updates game schedules and live scores
4. **stats_sync** - Syncs completed game statistics
5. **roster_sync** - Updates NBA player roster

## Setup Instructions

### Step 1: Get Your Admin API Token

1. Open your Replit project
2. Go to "Secrets" (lock icon in left sidebar)
3. Find `ADMIN_API_TOKEN` and copy its value
4. Save this somewhere secure - you'll need it for cron-job.org

### Step 2: Get Your Published Site URL

Your published site URL should be something like:
```
https://your-repl-name.replit.app
```

Find this in your Replit deployment settings.

### Step 3: Create Account on cron-job.org

1. Go to https://cron-job.org
2. Sign up for a free account
3. Verify your email

### Step 4: Create Cron Jobs

For each job below, create a new cron job in cron-job.org:

#### Job 1: Create Contests (Daily at Midnight UTC)

- **Title:** Sportfolio - Create Contests
- **URL:** `https://your-repl-name.replit.app/api/admin/jobs/trigger`
- **Schedule:** Daily at 00:00 (midnight UTC)
  - Use cron expression: `0 0 * * *`
- **Request Method:** POST
- **Request Body:**
  ```json
  {"jobName": "create_contests"}
  ```
- **Headers:**
  - Name: `Content-Type`, Value: `application/json`
  - Name: `Authorization`, Value: `Bearer YOUR_ADMIN_API_TOKEN`

#### Job 2: Settle Contests (Every 5 Minutes)

- **Title:** Sportfolio - Settle Contests
- **URL:** `https://your-repl-name.replit.app/api/admin/jobs/trigger`
- **Schedule:** Every 5 minutes
  - Use cron expression: `*/5 * * * *`
- **Request Method:** POST
- **Request Body:**
  ```json
  {"jobName": "settle_contests"}
  ```
- **Headers:**
  - Name: `Content-Type`, Value: `application/json`
  - Name: `Authorization`, Value: `Bearer YOUR_ADMIN_API_TOKEN`

#### Job 3: Schedule Sync (Every Minute)

- **Title:** Sportfolio - Schedule Sync
- **URL:** `https://your-repl-name.replit.app/api/admin/jobs/trigger`
- **Schedule:** Every minute
  - Use cron expression: `* * * * *`
- **Request Method:** POST
- **Request Body:**
  ```json
  {"jobName": "schedule_sync"}
  ```
- **Headers:**
  - Name: `Content-Type`, Value: `application/json`
  - Name: `Authorization`, Value: `Bearer YOUR_ADMIN_API_TOKEN`

#### Job 4: Stats Sync (Every Hour)

- **Title:** Sportfolio - Stats Sync
- **URL:** `https://your-repl-name.replit.app/api/admin/jobs/trigger`
- **Schedule:** Every hour
  - Use cron expression: `0 * * * *`
- **Request Method:** POST
- **Request Body:**
  ```json
  {"jobName": "stats_sync"}
  ```
- **Headers:**
  - Name: `Content-Type`, Value: `application/json`
  - Name: `Authorization`, Value: `Bearer YOUR_ADMIN_API_TOKEN`

#### Job 5: Roster Sync (Daily at 5 AM UTC)

- **Title:** Sportfolio - Roster Sync
- **URL:** `https://your-repl-name.replit.app/api/admin/jobs/trigger`
- **Schedule:** Daily at 05:00 (5 AM UTC)
  - Use cron expression: `0 5 * * *`
- **Request Method:** POST
- **Request Body:**
  ```json
  {"jobName": "roster_sync"}
  ```
- **Headers:**
  - Name: `Content-Type`, Value: `application/json`
  - Name: `Authorization`, Value: `Bearer YOUR_ADMIN_API_TOKEN`

### Step 5: Test Your Setup

1. Manually run one of the cron jobs in cron-job.org
2. Check the execution history - it should show HTTP 200 response
3. Visit `/admin` on your site to verify the job ran successfully

### Step 6: Monitor Your Jobs

- cron-job.org provides execution logs showing success/failure
- You can also check `/admin` page on your site to see last job runs
- Failed jobs will show up as errors in cron-job.org

## Manual Trigger via Admin Panel

Admin users can access the admin panel for manual job triggers and system monitoring:

1. Log into your Sportfolio site as an admin user
2. Visit your profile page
3. Click the "Admin" button (only visible to admin users)
4. View system stats and use job trigger buttons to run jobs manually

**Security Model:**
- Admin panel access requires the `isAdmin` flag to be set to `true` in the users table
- External cron jobs use token-based authentication (`ADMIN_API_TOKEN`) for secure automated access
- To grant admin access to a user, run: `UPDATE users SET is_admin = true WHERE id = 'user_id';`

## Troubleshooting

### Job Returns 401 Unauthorized

**For external cron jobs:**
- Check that your `ADMIN_API_TOKEN` is correct in the Authorization header
- Make sure you included "Bearer " prefix in the header value

**For admin panel access:**
- Ensure you're logged in to the application
- Verify your user has `is_admin = true` in the database
- To grant admin access: `UPDATE users SET is_admin = true WHERE id = 'user_id';`

### Job Returns 503 Service Unavailable
- Your `ADMIN_API_TOKEN` environment variable is not set in Replit
- Add it in Secrets (or environment variables in deployment) and redeploy

### Contests Not Appearing
- Run `create_contests` job manually first
- Check that MySportsFeeds API is accessible from your deployed site
- Verify `MYSPORTSFEEDS_API_KEY` is set in production secrets

### Games Not Updating
- Make sure `schedule_sync` job is running every minute
- Check job execution logs in cron-job.org for errors

## Cost

cron-job.org is completely free for up to 50 cron jobs. Sportfolio only needs 5, so you're well within the limits.

## Security

Your `ADMIN_API_TOKEN` acts as authentication for these endpoints. Keep it secure:
- Don't share it publicly
- Rotate it periodically (update in both Replit Secrets and cron-job.org)
- Only use HTTPS URLs (Replit provides this automatically)
