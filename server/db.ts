import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Determine which database to use based on environment
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = isProduction
  ? process.env.DATABASE_URL
  : (process.env.DEV_DATABASE_URL || process.env.DATABASE_URL);

console.log(`[DB] Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`[DB] Using ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} database`);

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL (or DEV_DATABASE_URL for local dev) must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 5, // Limit pool to 5 connections to prevent Supabase "MaxClientsInSessionMode" errors
  connectionTimeoutMillis: 5000, // Fail fast if pool is full
  idleTimeoutMillis: 30000 // Close idle connections
});
export const db = drizzle(pool, { schema });
