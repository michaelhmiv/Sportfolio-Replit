
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Manual .env loading
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim().replace(/^"(.*)"$/, '$1');
        }
    });
}

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL must be set");
    process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkPolicies() {
    try {
        console.log("Checking tables and policies...");

        // Get all tables in public schema
        const tablesRes = await pool.query(`
            SELECT tablename, rowsecurity 
            FROM pg_tables 
            JOIN pg_class ON pg_tables.tablename = pg_class.relname
            JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
            WHERE pg_namespace.nspname = 'public' 
            ORDER BY tablename;
        `);

        // Get all policies
        const policiesRes = await pool.query(`
            SELECT schemaname, tablename, policyname, cmd, roles 
            FROM pg_policies 
            WHERE schemaname = 'public';
        `);

        const policiesByTable: { [key: string]: any[] } = {};
        policiesRes.rows.forEach(p => {
            if (!policiesByTable[p.tablename]) policiesByTable[p.tablename] = [];
            policiesByTable[p.tablename].push(p);
        });

        const reportLines = [];
        const log = (msg) => {
            console.log(msg);
            reportLines.push(msg);
        };

        log("\n--- TABLE STATUS ---");
        log(String("Table Name").padEnd(30) + String("RLS Enabled").padEnd(15) + "Policies");
        log("-".repeat(60));

        tablesRes.rows.forEach(row => {
            const tableName = row.tablename;
            const rlsEnabled = row.rowsecurity;
            const policies = policiesByTable[tableName] || [];

            log(
                String(tableName).padEnd(30) +
                String(rlsEnabled).padEnd(15) +
                String(policies.length)
            );

            if (policies.length > 0) {
                policies.forEach((p: any) => {
                    log(`    - ${p.policyname} (${p.cmd})`);
                });
            }
        });

        log("\nDone.");
        fs.writeFileSync('policies_report.txt', reportLines.join('\n'), 'utf8');

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

checkPolicies();
