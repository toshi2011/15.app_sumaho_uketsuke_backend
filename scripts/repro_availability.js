
const { createStrapi } = require('@strapi/strapi');

async function check() {
    try {
        const strapi = await createStrapi().load();
        const stores = await strapi.entityService.findMany('api::store.store', { populate: ['businessHours'] });
        const store = stores[0];

        if (!store) {
            console.log("No store found");
            process.exit(1);
        }

        console.log(`Store: ${store.name} (ID: ${store.id})`);
        console.log(`Business Hours:`, JSON.stringify(store.businessHours, null, 2));
        console.log(`Lunch End Time (legacy field):`, store.lunchEndTime);
        console.log(`Lunch Duration:`, store.lunchDuration);

        // Simulate the user's scenario
        // 12/27 12:00 -> 3 reservations exist (implies full capacity if small store)
        // User says 13:00 is OK, 13:15 is NG.

        console.log("\n--- Checking 13:00 ---");
        const check1 = await strapi.service('api::store.store').checkAvailability(store.id, '2025-12-27', '13:00', 3);
        console.log('Result:', JSON.stringify(check1, null, 2));

        console.log("\n--- Checking 13:15 ---");
        const check2 = await strapi.service('api::store.store').checkAvailability(store.id, '2025-12-27', '13:15', 3);
        console.log('Result:', JSON.stringify(check2, null, 2));

    } catch (error) {
        console.error('Script Error:', error);
    }

    process.exit(0);
}

check();
