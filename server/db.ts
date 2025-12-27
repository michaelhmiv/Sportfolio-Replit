import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Log all available environment variable keys for debugging
console.log("Available environment variables:", Object.keys(process.env));

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5, // Limit pool to 5 connections to prevent Supabase "MaxClientsInSessionMode" errors
  connectionTimeoutMillis: 5000, // Fail fast if pool is full
  idleTimeoutMillis: 30000 // Close idle connections
});
export const db = drizzle(pool, { schema });

