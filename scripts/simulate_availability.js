
const BASE_URL = 'http://127.0.0.1:1338/api';

async function main() {
    // Check fetch availability
    if (typeof fetch === 'undefined') {
        console.error('Error: native fetch is not available. Please run with Node 18+.');
        process.exit(1);
    }

    try {
        console.log('--- Availability Simulator ---');
        console.log(`Connecting to ${BASE_URL}/stores...`);

        // 1. Fetch Store
        let storeRes;
        try {
            // Try wildcard populate
            storeRes = await fetch(`${BASE_URL}/stores?populate=*`);
        } catch (netErr) {
            console.error('Network Error:', netErr);
            console.error('Ensure the Strapi backend is running on port 1337.');
            process.exit(1);
        }

        if (!storeRes.ok) {
            const errorText = await storeRes.text();
            console.error(`Fetch Failed: ${storeRes.status} ${storeRes.statusText}`);
            console.error('Response Body:', errorText);

            if (storeRes.status === 403) {
                console.error('Error: 403 Forbidden. Is the endpoint public?');
            }
            process.exit(1);
        }

        const storeJson = await storeRes.json();
        const stores = storeJson.data;

        if (!stores || stores.length === 0) {
            console.error('No stores found.');
            process.exit(1);
        }

        const store = stores[0];
        const attr = store.attributes || store; // Handle Strapi v4 vs v5 flat structure

        console.log(`\nTarget Store: ${attr.name} (ID: ${store.id})`);

        const bh = attr.businessHours || {};
        const lunch = bh.lunch || {};
        const dinner = bh.dinner || {};

        console.log('--- Current Settings ---');
        console.log(`Lunch: ${lunch.start} ~ ${lunch.end} (LO: ${lunch.lastOrder || 'None'})`);
        console.log(`Dinner: ${dinner.start} ~ ${dinner.end}`);
        console.log('------------------------\n');

        // Logic for Tests
        const lunchEnd = lunch.end || "15:00";
        const lunchLO = lunch.lastOrder || lunchEnd;
        const [loH, loM] = lunchLO.split(':').map(Number);
        const loMin = loH * 60 + loM;

        function minutesToTime(min) {
            const h = Math.floor(min / 60);
            const m = min % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }

        const validLunchTime = minutesToTime(loMin - 15);
        const invalidLunchTime = minutesToTime(loMin - 14); // 1 min after limit
        const invalidGapTime = minutesToTime(loMin + 20); // Definitely in Gap

        console.log(`Based on LO ${lunchLO}, testing boundary ${validLunchTime} vs ${invalidLunchTime}`);

        const date = '2025-12-28';
        const guests = 2;

        const testCases = [
            { name: 'Lunch Valid (LO - 15m)', time: validLunchTime, expect: true },
            { name: 'Lunch Invalid (LO - 14m)', time: invalidLunchTime, expect: false },
            { name: 'Gap (After Lunch)', time: invalidGapTime, expect: false },
        ];

        // Add Dinner Test
        if (dinner.start && dinner.end) {
            const [dEndH, dEndM] = dinner.end.split(':').map(Number);
            const dEndMin = dEndH * 60 + dEndM;
            const duration = 120; // assumed
            // Strict Closing: Check if (Time + Duration) <= End
            // Valid: End - Duration
            const validDinnerMin = dEndMin - duration;
            const validDinnerTime = minutesToTime(validDinnerMin);

            // Invalid: End - Duration + 1
            const invalidDinnerMin = dEndMin - duration + 1;
            const invalidDinnerTime = minutesToTime(invalidDinnerMin);

            testCases.push({ name: 'Dinner Valid (Max Stay)', time: validDinnerTime, expect: true });
            testCases.push({ name: 'Dinner Invalid (Overtime)', time: invalidDinnerTime, expect: false });
        }

        console.log(`Running Tests for Date: ${date}, Guests: ${guests}\n`);

        for (const test of testCases) {
            const url = `${BASE_URL}/stores/${store.id}/check-availability?date=${date}&time=${test.time}&guests=${guests}`;
            const res = await fetch(url);
            const json = await res.json();

            const isAvailable = json.available;
            const pass = isAvailable === test.expect;
            const mark = pass ? '✅' : '❌';

            console.log(`${mark} [${test.name}] Time: ${test.time}`);
            console.log(`   Expected: ${test.expect ? 'Available' : 'Unavailable'}`);
            console.log(`   Actual:   ${isAvailable ? 'Available' : 'Unavailable'}`);
            if (!pass || !isAvailable) {
                console.log(`   Reason:   ${json.reason || 'N/A'}`);
            }
            console.log('');
        }

    } catch (error) {
        console.error('Simulation failed:', error);
    }
}

main();
