
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Manual .env loading
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim().replace(/^"(.*)"$/, '$1');
        }
    });
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });

(async () => {
    try {
        await client.connect();

        // Use process.cwd() to verify path, pointing to scripts directory
        const sqlPath = path.resolve(process.cwd(), 'scripts', 'disable-rls.sql');
        console.log('SQL Path:', sqlPath);

        if (!fs.existsSync(sqlPath)) {
            throw new Error(`File not found: ${sqlPath}`);
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('Read SQL file, length:', sql.length);

        console.log('Running RLS enable script...');
        const result = await client.query(sql);

        console.log('RLS enabled successfully!');
        // Result might be an array if multiple statements
        if (Array.isArray(result)) {
            const lastResult = result[result.length - 1];
            if (lastResult.rows) console.log(lastResult.rows);
        } else if (result.rows) {
            console.log(result.rows);
        }
    } catch (error) {
        console.error('FULL ERROR:', error);
    } finally {
        await client.end();
    }
})();
