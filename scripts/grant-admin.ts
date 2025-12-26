import { Pool } from 'pg';
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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function grantAdmin() {
    const email = 'michaelhmiv@gmail.com';

    try {
        // Find user by email
        const findResult = await pool.query(
            'SELECT id, username, email, is_admin FROM users WHERE email = $1',
            [email]
        );

        if (findResult.rows.length === 0) {
            console.log(`User with email ${email} not found.`);
            await pool.end();
            process.exit(1);
        }

        const user = findResult.rows[0];
        console.log(`Found user: ${user.username} (${user.email})`);
        console.log(`Current admin status: ${user.is_admin}`);

        // Update to admin
        await pool.query(
            'UPDATE users SET is_admin = true WHERE email = $1',
            [email]
        );

        console.log(`✓ Admin rights granted to ${user.username}`);

        await pool.end();
    } catch (e) {
        console.error('ERROR:', e);
        await pool.end();
        process.exit(1);
    }
}

grantAdmin();
