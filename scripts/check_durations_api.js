const http = require('http');

const options = {
    hostname: '127.0.0.1',
    port: 1337,
    path: '/api/reservations?populate=*&sort=date:desc&pagination[limit]=10',
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
    },
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.data) {
                console.log("Checking last 10 reservations from API:");
                json.data.forEach(r => {
                    // API v4 structure: r.attributes... but entityService return might be flattened depending on plugin. 
                    // Standard REST API returns { attributes: { ... } }
                    const attrs = r.attributes || r;
                    console.log(`[${r.id}] ${attrs.date} ${attrs.time} - Duration: ${attrs.duration}`);
                });
            } else {
                console.log("No data found or error: ", json);
            }
        } catch (e) {
            console.error(e.message);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
