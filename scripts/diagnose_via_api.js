const http = require('http');

const storeId = 'kbgudc7dpipl79d2focnm09n';
const date = '2026-01-09';
const guests = 3;

function check(time) {
    return new Promise((resolve, reject) => {
        const url = `/api/stores/${storeId}/check-availability?date=${date}&time=${time}&guests=${guests}`;
        const options = {
            hostname: '127.0.0.1',
            port: 1337,
            path: url,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

async function run() {
    console.log(`Checking Availability for ${date} via API...`);

    for (const tm of ['13:00', '13:15']) {
        console.log(`\n--- Time: ${tm} (Guests: ${guests}) ---`);
        try {
            const result = await check(tm);
            if (result.status === 200) {
                const res = result.data;
                console.log(`Available: ${res.available}`);
                if (!res.available) {
                    console.log(`Reason: ${res.reason}`);
                } else {
                    console.log(`Assigned Table: ${res.candidateTable?.name} (ID: ${res.candidateTable?.id})`);
                    console.log(`Required Duration: ${res.requiredDuration}`);
                    // Ensure it uses the Counter if expected
                }
            } else {
                console.log(`API Error ${result.status}:`, result.data);
            }
        } catch (e) {
            console.error('Request Failed:', e.message);
        }
    }
}

run();
