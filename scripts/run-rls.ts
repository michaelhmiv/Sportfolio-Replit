import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const sqlPath = path.join(import.meta.dirname, 'enable-rls.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

console.log('Running RLS enable script...');

pool.query(sql)
    .then((result) => {
        console.log('RLS enabled successfully!');
        if (result.rows) {
            console.log(result.rows);
        }
        pool.end();
    })
    .catch((error) => {
        console.error('Error:', error.message);
        pool.end();
        process.exit(1);
    });
