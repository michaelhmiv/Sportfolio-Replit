
const fs = require('fs');

try {
    const buffer = fs.readFileSync('run_rls_output.txt');
    // Try to detect encoding or just convert to string
    // PowerShell redirection often creates UTF-16LE
    let content = buffer.toString('utf16le');
    if (content.includes('')) { // Bad decode check (heuristic)
        content = buffer.toString('utf8');
    }

    console.log("--- START LOG DUMP ---");
    console.log(content.slice(-2000)); // Last 2000 chars
    console.log("--- END LOG DUMP ---");
} catch (e) {
    console.error(e);
}
