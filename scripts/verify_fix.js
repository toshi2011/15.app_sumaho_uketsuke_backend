
const { createStrapi } = require('@strapi/strapi');

async function main() {
    // Use simple start if possible, or try to load
    const strapi = await createStrapi().load();

    try {
        const stores = await strapi.entityService.findMany('api::store.store', { populate: ['businessHours'] });
        const store = stores[0];
        if (!store) {
            console.log('No store found.');
            process.exit(1);
        }

        console.log(`Checking Store: ${store.name}`);

        // Setup Mock Data for Lunch
        // Lunch End: 14:00 (Implies LO 14:00 or user set LO?)
        // Let's assume Lunch End is 14:00.
        // Rule: LO - 15min. If LO=14:00, Limit=13:45.

        const lunchEndStr = store.businessHours?.lunch?.end || "14:00";
        console.log(`Lunch End: ${lunchEndStr}`);

        // Test 1: Lunch - 15 min before End -> Should be OK
        // Say LunchEnd is 14:00. Target 13:45.
        // If logic is strict "Target <= LO - 15", then 13:45 is OK. 13:46 is NG.

        console.log('\n--- Test 1: Lunch Boundary (13:45 for 14:00 Close) ---');
        // We need to parse lunchEndStr to construct test time.
        const [h, m] = lunchEndStr.split(':').map(Number);
        const endMin = h * 60 + m;
        const testMin = endMin - 15;
        const testH = Math.floor(testMin / 60);
        const testM = testMin % 60;
        const testTime = `${String(testH).padStart(2, '0')}:${String(testM).padStart(2, '0')}`;

        console.log(`Testing Time: ${testTime}`);
        const res1 = await strapi.service('api::store.store').checkAvailability(store.id, '2025-12-28', testTime, 2);
        console.log(`Result: ${res1.available ? 'OK' : 'NG'}`, res1.reason || '');

        console.log('\n--- Test 2: Lunch Over Boundary (13:46 for 14:00 Close) ---');
        const testMin2 = endMin - 14;
        const testH2 = Math.floor(testMin2 / 60);
        const testM2 = testMin2 % 60;
        const testTime2 = `${String(testH2).padStart(2, '0')}:${String(testM2).padStart(2, '0')}`;

        console.log(`Testing Time: ${testTime2}`);
        const res2 = await strapi.service('api::store.store').checkAvailability(store.id, '2025-12-28', testTime2, 2);
        console.log(`Result: ${res2.available ? 'OK' : 'NG'}`, res2.reason || '');


        // Test 3: Dinner Strict Closing
        // Dinner End: 23:00. 
        // If Duration 60 (default? or specified?), and Start 22:00 -> End 23:00 -> OK.
        // Start 22:01 -> End 23:01 -> NG.

        const dinnerEndStr = store.businessHours?.dinner?.end || "23:00";
        console.log(`\nDiff Dinner End: ${dinnerEndStr}`);

        // Assume 2 hours duration (120min) for dinner usually?
        // Let's rely on store settings for duration.
        // Just allow the log to show what happens.

        console.log('\n--- Test 3: Dinner Late ---');
        // Try 30 mins before close.
        const [dh, dm] = dinnerEndStr.split(':').map(Number);
        const dEndMin = dh * 60 + dm;
        const dTestMin = dEndMin - 30; // 22:30 for 23:00
        const dTestH = Math.floor(dTestMin / 60);
        const dTestM = dTestMin % 60;
        const dTestTime = `${String(dTestH).padStart(2, '0')}:${String(dTestM).padStart(2, '0')}`;

        console.log(`Testing Time: ${dTestTime} (Should fail if duration > 30min)`);
        const res3 = await strapi.service('api::store.store').checkAvailability(store.id, '2025-12-28', dTestTime, 2);
        console.log(`Result: ${res3.available ? 'OK' : 'NG'}`, res3.reason || '');

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

main();
