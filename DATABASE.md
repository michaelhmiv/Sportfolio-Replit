# Database Configuration

This project uses **environment-based database switching** for safe development.

## Quick Reference

| Environment | Variable Used | Description |
|-------------|---------------|-------------|
| Development | `DEV_DATABASE_URL` | Local Docker PostgreSQL (port 5433) |
| Production | `DATABASE_URL` | Supabase Cloud (Railway sets `NODE_ENV=production`) |

## How It Works

```
NODE_ENV === 'production' → DATABASE_URL (Supabase)
NODE_ENV !== 'production' → DEV_DATABASE_URL (fallback to DATABASE_URL)
```

## Local Development Setup

1. **Start Docker PostgreSQL:**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

2. **Add to `.env`:**
   ```
   DEV_DATABASE_URL=postgresql://postgres:devpassword@localhost:5433/sportfolio_dev
   ```

3. **Run migrations:**
   ```bash
   npm run db:push
   ```

See [/.agent/workflows/local-dev-database.md](.agent/workflows/local-dev-database.md) for full documentation.

## Files That Control Database Selection

- `server/db.ts` - Runtime connection
- `drizzle.config.ts` - Drizzle migrations

## Verification

When running `npm run db:push`, look for:
- ✅ `[Drizzle] Using DEVELOPMENT database`
- ⚠️ `[Drizzle] Using PRODUCTION database`
