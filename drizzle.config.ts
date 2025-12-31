import { defineConfig } from "drizzle-kit";

// Use DEV_DATABASE_URL for local development, DATABASE_URL for production
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = isProduction
  ? process.env.DATABASE_URL
  : (process.env.DEV_DATABASE_URL || process.env.DATABASE_URL);

if (!databaseUrl) {
  throw new Error("DATABASE_URL (or DEV_DATABASE_URL for local dev) must be set");
}

console.log(`[Drizzle] Using ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} database`);

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
