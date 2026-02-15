const http = require('http');

const options = {
    hostname: 'localhost',
    port: 1337,
    path: '/api/stores/kbgudc7dpipl79d2focnm09n/check-availability?date=2026-01-09&time=12:00&guests=2',
    method: 'GET',
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('BODY:', data);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
