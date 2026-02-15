const http = require('http');
const fs = require('fs');

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
            try {
                const json = JSON.parse(data);
                fs.writeFileSync('migration_response.json', JSON.stringify(json, null, 2));
                console.log('Response saved to migration_response.json');
            } catch (e) {
                console.log('Raw Body:', data);
                fs.writeFileSync('migration_response.txt', data);
            }
        });
    });

    req.on('error', (e) => console.error(e));
    req.end();
}

trigger();
