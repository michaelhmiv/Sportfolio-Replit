/**
 * Run create_contests job directly
 */
import { createContests } from '../server/jobs/create-contests';
import '../server/storage'; // Initialize DB connection

async function run() {
    console.log('Running create_contests job...\n');
    const result = await createContests();
    console.log('\nResult:', result);
}

run().catch(console.error);
