const fetch = require('node-fetch'); // Strapi server has node-fetch or global fetch usually. If not, we use global.

async function verifyApi() {
    const API_URL = 'http://127.0.0.1:1337/api/reservations?populate=*&sort=date:desc&pagination[pageSize]=100';

    try {
        console.log(`Fetching from ${API_URL}...`);
        const res = await fetch(API_URL);
        if (!res.ok) {
            console.error(`API Error: ${res.status} ${res.statusText}`);
            console.error(await res.text());
            return;
        }

        const json = await res.json();
        console.log(`Total reservations returned: ${json.data.length}`);

        const targetIds = [37, 35, 33];
        const found = json.data.filter(r => targetIds.includes(r.id));

        console.log('--- Checking Target Reservations ---');
        if (found.length === 0) {
            console.log('Target reservations (IDs 33, 35, 37) NOT FOUND in API response.');
        } else {
            found.forEach(r => {
                console.log(`[FOUND] ID: ${r.id}, Date: ${r.attributes.date}, Time: ${r.attributes.time}, Status: ${r.attributes.status}`);
                console.log(`        Store: ${r.attributes.store?.data?.attributes?.name} (DocID: ${r.attributes.store?.data?.documentId})`);
            });
        }

        console.log('--- Env Check ---');
        // We can't easily check backend env from a standalone script without loading Strapi, 
        // but this script runs in the context of 'npm run develop' IF we ran it via 'strapi console'.
        // Standalone node script doesn't see env unless dotenv is loaded.
        // We'll rely on the API response for data visibility.

    } catch (e) {
        console.error('Script Error:', e);
    }
}

verifyApi();
