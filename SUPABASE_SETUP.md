# Railway + Supabase Database Setup

## Changes Made

1. **Fixed `.gitignore`** - Now properly ignores `.env` files while allowing `.env.example`
2. **Created `.env.example`** - Documents required environment variables  
3. **Switched database driver** - Changed from Neon (`@neondatabase/serverless`) to standard PostgreSQL (`pg`)
4. **Installed `pg` package** - Added `pg` and `@types/pg` dependencies

## How to Push Tables to Supabase

### Option 1: Run locally with .env file (Recommended for first-time setup)

1. Create a `.env` file in your project root with your Supabase connection string:
   ```
   DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```

2. Run the migration:
   ```bash
   npm run db:push
   ```

### Option 2: Run with inline DATABASE_URL

```bash
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres" npm run db:push
```

### Option 3: Use Supabase SQL Editor

Copy the contents of `migrations/0000_sloppy_dazzler.sql` and `migrations/0001_nosy_patriot.sql` and run them directly in Supabase's SQL Editor.

## After Pushing Tables

1. Commit and push your changes to GitHub:
   ```bash
   git add .
   git commit -m "Switch to pg driver for Supabase compatibility"
   git push
   ```

2. Railway will automatically redeploy with the new code

## Important Notes

- **Never commit `.env`** - It's now properly gitignored
- **Railway uses environment variables** - Your `DATABASE_URL` set in Railway dashboard will be used at runtime
- **The `.env` file is only needed locally** for running migrations or testing

## Supabase Connection String Format

Get your connection string from: **Supabase Dashboard > Project Settings > Database > Connection string**

Choose "Connection pooling" and use:
- **Transaction mode** (port 6543) - Best for serverless/Railway
