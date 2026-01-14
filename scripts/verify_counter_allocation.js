const { createStrapi } = require('@strapi/strapi');

async function verifyCounterAllocation() {
    const strapi = await createStrapi({ distDir: './dist' }).load();
    const service = strapi.service('api::store.store');

    // Known store ID
    const storeId = 'kbgudc7dpipl79d2focnm09n';

    // Future date/time
    const date = '2026-02-15';
    const time = '18:00';
    const guests = 2; // Should trigger sequential counter logic

    console.log(`Checking availability for ${guests} guests at ${time} on ${date}...`);

    // Clean up existing reservations for test? 
    // Or just pick a clean date. 2026-02-15 is likely clean.

    const result = await service.checkAvailability(storeId, date, time, guests);

    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.available && result.assignedTables && result.assignedTables.length === guests) {
        const names = result.assignedTables.map(t => t.name);
        console.log(`Assigned Tables: ${names.join(', ')}`);

        const isCounter = result.assignedTables.every(t => t.type === 'counter' || t.name.includes('カウンター'));
        if (isCounter) {
            console.log("SUCCESS: Assigned to Counters.");
        } else {
            console.log("FAILURE: Assigned to non-counter tables.");
        }
    } else {
        console.log("FAILURE: Not available or incorrect assignment.");
    }

    process.exit(0);
}

verifyCounterAllocation();
