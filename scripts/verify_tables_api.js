const http = require('http');

const storeId = 'kbgudc7dpipl79d2focnm09n';

const options = {
    hostname: 'localhost',
    port: 1337,
    path: `/api/stores/${storeId}?populate=tables`,
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
            const body = JSON.parse(data);
            const tables = body.data.attributes ? body.data.attributes.tables.data : body.data.tables;
            // Strapi v5 structure might differ (documentId etc). 
            // If v4: data.attributes.tables.data
            // If v5: data.tables (if populated properly) or data.attributes.tables

            console.log("Full Structure Keys:", Object.keys(body.data || {}));

            let tableList = [];
            if (Array.isArray(body.data.tables)) tableList = body.data.tables;
            else if (body.data.attributes && body.data.attributes.tables) tableList = body.data.attributes.tables.data || body.data.attributes.tables;

            console.log(`Found ${tableList.length} tables.`);
            tableList.forEach(t => {
                const attrs = t.attributes || t;
                console.log(`- ${attrs.name} (Active: ${attrs.isActive})`);
            });
        } else {
            console.log('Error Body:', data);
        }
    });
});

req.on('error', (e) => console.error(e));
req.end();
