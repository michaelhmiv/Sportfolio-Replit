import { createClient } from '@supabase/supabase-js';

// Load environment variables
const tests: { name: string; test: () => Promise<boolean>; }[] = [];

// Test 1: Database Connection
tests.push({
    name: 'DATABASE_URL',
    test: async () => {
        const { Pool } = await import('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        try {
            const result = await pool.query('SELECT 1 as ok');
            await pool.end();
            return result.rows[0].ok === 1;
        } catch (e) {
            console.error('  Error:', (e as Error).message);
            return false;
        }
    }
});

// Test 2: Supabase Connection
tests.push({
    name: 'SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    test: async () => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
            console.error('  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
            return false;
        }
        try {
            const supabase = createClient(url, key);
            const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 });
            if (error) {
                console.error('  Error:', error.message);
                return false;
            }
            return true;
        } catch (e) {
            console.error('  Error:', (e as Error).message);
            return false;
        }
    }
});

// Test 3: Supabase Anon Key
tests.push({
    name: 'SUPABASE_ANON_KEY',
    test: async () => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_ANON_KEY;
        if (!url || !key) {
            console.error('  Missing SUPABASE_URL or SUPABASE_ANON_KEY');
            return false;
        }
        try {
            const supabase = createClient(url, key);
            // Anon key should be able to get session (even if null)
            const { error } = await supabase.auth.getSession();
            if (error) {
                console.error('  Error:', error.message);
                return false;
            }
            return true;
        } catch (e) {
            console.error('  Error:', (e as Error).message);
            return false;
        }
    }
});

// Test 4: Whop API Key
tests.push({
    name: 'WHOP_API_KEY',
    test: async () => {
        const apiKey = process.env.WHOP_API_KEY;
        if (!apiKey) {
            console.error('  Missing WHOP_API_KEY');
            return false;
        }
        try {
            const response = await fetch('https://api.whop.com/api/v5/me', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (!response.ok) {
                const text = await response.text();
                console.error('  Error:', response.status, text.substring(0, 100));
                return false;
            }
            return true;
        } catch (e) {
            console.error('  Error:', (e as Error).message);
            return false;
        }
    }
});

// Test 5: Twitter API Keys
tests.push({
    name: 'TWITTER_API_KEY + TWITTER_API_SECRET',
    test: async () => {
        const apiKey = process.env.TWITTER_API_KEY;
        const apiSecret = process.env.TWITTER_API_SECRET;
        if (!apiKey || !apiSecret) {
            console.error('  Missing TWITTER_API_KEY or TWITTER_API_SECRET');
            return false;
        }
        try {
            // Get bearer token using app-only auth
            const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
            const response = await fetch('https://api.twitter.com/oauth2/token', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'grant_type=client_credentials'
            });
            if (!response.ok) {
                const text = await response.text();
                console.error('  Error:', response.status, text.substring(0, 100));
                return false;
            }
            return true;
        } catch (e) {
            console.error('  Error:', (e as Error).message);
            return false;
        }
    }
});

// Test 6: Twitter Access Tokens (OAuth 1.0a user tokens)
tests.push({
    name: 'TWITTER_ACCESS_TOKEN + TWITTER_ACCESS_TOKEN_SECRET',
    test: async () => {
        const accessToken = process.env.TWITTER_ACCESS_TOKEN;
        const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
        const apiKey = process.env.TWITTER_API_KEY;
        const apiSecret = process.env.TWITTER_API_SECRET;
        if (!accessToken || !accessSecret || !apiKey || !apiSecret) {
            console.error('  Missing Twitter tokens');
            return false;
        }
        try {
            // Use twitter-api-v2 library for OAuth 1.0a
            const { TwitterApi } = await import('twitter-api-v2');
            const client = new TwitterApi({
                appKey: apiKey,
                appSecret: apiSecret,
                accessToken: accessToken,
                accessSecret: accessSecret,
            });
            const me = await client.v2.me();
            console.log('  Twitter user:', me.data.username);
            return true;
        } catch (e) {
            console.error('  Error:', (e as Error).message);
            return false;
        }
    }
});

// Run all tests
console.log('\n🔧 Testing Environment Variables...\n');

let passed = 0;
let failed = 0;

for (const { name, test } of tests) {
    process.stdout.write(`Testing ${name}... `);
    try {
        const result = await test();
        if (result) {
            console.log('✅ OK');
            passed++;
        } else {
            console.log('❌ FAILED');
            failed++;
        }
    } catch (e) {
        console.log('❌ FAILED');
        console.error('  Unexpected error:', (e as Error).message);
        failed++;
    }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

// Check non-testable variables
console.log('📝 Non-testable variables (just checking they exist):');
const simpleVars = ['SESSION_SECRET', 'ADMIN_API_TOKEN', 'WHOP_PLAN_ID', 'WHOP_WEBHOOK_SECRET', 'NODE_ENV'];
for (const name of simpleVars) {
    const value = process.env[name];
    console.log(`  ${name}: ${value ? '✅ Set' : '❌ Missing'}`);
}

process.exit(failed > 0 ? 1 : 0);
