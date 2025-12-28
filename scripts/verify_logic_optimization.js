const { createStrapi } = require('@strapi/strapi');

async function main() {
    const app = await createStrapi({ distDir: './dist' }).load();

    const STORE_DOC_ID = 'yxezke33o8wm6q2zq1zrna7d';
    const TEST_DATE = '2025-12-30';
    const TEST_TIME = '18:00';

    const fs = require('fs');
    let logOutput = '';
    const log = (msg) => { console.log(msg); logOutput += msg + '\n'; };

    try {
        // 1. Inspect Tables
        log('--- 1. Inspect Tables ---');
        const store = await app.db.query('api::store.store').findOne({
            where: { documentId: STORE_DOC_ID },
            populate: ['tables']
        });

        if (!store) {
            console.error('Store not found');
            process.exit(1);
        }

        log(`Store: ${store.name}`);
        const tables = store.tables;
        tables.forEach(t => {
            log(`Table: ${t.name} | Type: ${t.type || 'N/A'} | Cap: ${t.baseCapacity} | Max: ${t.maxCapacity}`);
        });

        // 2. Test Allocation for 2 guests (Should prefer Counter if exists and type is set)
        log('\n--- 2. Test Allocation: 2 Guests ---');
        const res2 = await app.service('api::store.store').checkAvailability(store.documentId, TEST_DATE, TEST_TIME, 2);
        if (res2.available) {
            log(`Assigned: ${res2.candidateTable.name} (Type: ${res2.candidateTable.type})`);
        } else {
            log('Not Available: ' + res2.reason);
        }

        // 3. Test Allocation for 4 guests (Should prefer Table)
        log('\n--- 3. Test Allocation: 4 Guests ---');
        const res4 = await app.service('api::store.store').checkAvailability(store.documentId, TEST_DATE, TEST_TIME, 4);
        if (res4.available) {
            log(`Assigned: ${res4.candidateTable.name} (Type: ${res4.candidateTable.type})`);
        } else {
            log('Not Available: ' + res4.reason);
        }

        // 4. Test Note Preference "カウンター希望"
        log('\n--- 4. Test Note Preference ---');
        // Using Controller Logic (simulated call or direct check if I could invoke controller, but service doesn't have this logic)
        // I will replicate the controller check here to verify it works as expected
        const note = "カウンター希望です";
        const seatPreferenceKeywords = ['テーブル', 'カウンター', '個室', '席', '指定', '希望'];
        const hasSeatPreference = seatPreferenceKeywords.some(key => note.includes(key));
        log(`Note: "${note}"`);
        log(`Has Preference? ${hasSeatPreference}`);

        // Check Store Mode
        const mode = store.bookingAcceptanceMode || 'manual';
        log(`Store Mode: ${mode}`);

        if (mode === 'auto' && hasSeatPreference) {
            log('Result: Status would be PENDING (Correct)');
        } else if (mode === 'auto') {
            log('Result: Status would be CONFIRMED');
        } else {
            log('Result: Status would be PENDING (Manual Mode)');
        }

        fs.writeFileSync('verify_result.txt', logOutput);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        // app.destroy(); // destroy sometimes hangs in scripts, just exit
        process.exit(0);
    }
}

main();
