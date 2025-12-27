
const fs = require('fs');
const path = require('path');

try {
    const content = fs.readFileSync('policies.txt', 'utf16le');
    console.log(content);
} catch (e) {
    console.error("Error reading file:", e);
}
