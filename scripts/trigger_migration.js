const http = require('http');

const storeId = 'kbgudc7dpipl79d2focnm09n';

function trigger() {
    const options = {
        hostname: 'localhost',
        port: 1337,
        path: `/api/stores/${storeId}/migrate-counters`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log(`Status: ${res.statusCode}`);
            console.log('Body:', data);
        });
    });

    req.on('error', (e) => console.error(e));
    req.end();
}

trigger();
