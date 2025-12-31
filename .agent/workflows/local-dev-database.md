---
description: how to set up and use the local development database
---

# Local Dev Database Setup

## ⚠️ DEV vs PRODUCTION - Know the Difference!

| Aspect | DEVELOPMENT | PRODUCTION |
|--------|-------------|------------|
| **Environment Variable** | `DEV_DATABASE_URL` | `DATABASE_URL` |
| **Location** | Local Docker (localhost:5433) | Supabase Cloud |
| **When Used** | `NODE_ENV` ≠ `production` | `NODE_ENV=production` |
| **Data** | Test/fake data, safe to delete | Real user data, NEVER delete |
| **Port** | 5433 | 5432 (remote) |

## How the App Decides Which DB to Use

```
IF NODE_ENV === 'production'
  → Use DATABASE_URL (Supabase production)
ELSE
  → Use DEV_DATABASE_URL if set
  → Fallback to DATABASE_URL if DEV_DATABASE_URL not set
```

**Railway automatically sets `NODE_ENV=production`**, so production deployments always use the right database.

---

## Prerequisites
- Docker Desktop installed and running

## First-Time Setup

// turbo-all

1. Start the local PostgreSQL container:
```bash
docker-compose -f docker-compose.dev.yml up -d
```

2. Add `DEV_DATABASE_URL` to your `.env` file:
```
DEV_DATABASE_URL=postgresql://postgres:devpassword@localhost:5433/sportfolio_dev
```

3. Run migrations on the dev database:
```bash
npm run db:push
```

4. Seed the dev database (optional):
```bash
npm run db:seed
```

## Daily Usage

### Start dev database
```bash
docker-compose -f docker-compose.dev.yml up -d
```

### Stop dev database (keeps data)
```bash
docker-compose -f docker-compose.dev.yml stop
```

### Remove dev database (deletes all data)
```bash
docker-compose -f docker-compose.dev.yml down -v
```

### View database logs
```bash
docker logs sportfolio-dev-db
```

## Verification Commands

### Check which database drizzle will use:
```bash
npm run db:push
# Look for: [Drizzle] Using DEVELOPMENT database
# or:       [Drizzle] Using PRODUCTION database
```

### Check dev database table count:
```bash
docker exec sportfolio-dev-db psql -U postgres -d sportfolio_dev -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
```

## Files That Control DB Selection
- `server/db.ts` - Runtime database selection
- `drizzle.config.ts` - Migration database selection
