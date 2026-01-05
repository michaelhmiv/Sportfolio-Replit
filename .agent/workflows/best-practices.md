---
description: best practices and coding standards for this project
---

# Development Best Practices

## 1. ALWAYS TEST BEFORE USER REVIEW ⚠️

**This is the most important rule:**

> Never send untested code to the user. Always run and verify changes yourself before asking for review.

### Testing Checklist:
- [ ] Run `npm run build` to check for TypeScript errors
- [ ] Test API endpoints directly with `npx tsx` or HTTP requests
- [ ] Verify database operations by querying the dev database
- [ ] Check server logs for errors after triggering functionality
- [ ] For frontend changes, use browser automation or verify in browser

### Examples of proper testing:
```bash
# Test an API endpoint
npx tsx -e "import 'dotenv/config'; /* test code here */"

# Check database state
docker exec sportfolio-dev-db psql -U postgres -d sportfolio_dev -c "SELECT ..."

# Verify build
npm run build
```

## 2. Database Environment Separation

- **Development:** Uses `DEV_DATABASE_URL` (local Docker on port 5433)
- **Production:** Uses `DATABASE_URL` (Supabase cloud)
- See [DATABASE.md](../../DATABASE.md) and [/local-dev-database workflow](./local-dev-database.md)

> [!IMPORTANT]
> **ALWAYS TARGET DEV FIRST**
> You must always verify changes against the **Development** database first using `process.env.NODE_ENV = 'development'` in scripts.
> Never apply schema changes or data fixes directly to Production without first validating them in Development.

## 3. Error Handling

- Always add meaningful console.log statements for debugging
- Include descriptive error messages in API responses
- Test error paths, not just happy paths
