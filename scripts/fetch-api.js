const http = require('http');

const url = 'http://localhost:5000/api/players?sport=nba&limit=1';

http.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
    });
}).on('error', (err) => {
    console.error('Request Error:', err.message);
});
