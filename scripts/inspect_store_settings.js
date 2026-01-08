const strapi = require('@strapi/strapi');

async function inspectStore() {
    const app = await strapi.createStrapi({ distDir: './dist' }).load();

    try {
        const storeId = 'kbgudc7dpipl79d2focnm09n';
        const date = '2026-01-08'; // User said "20250108" but consistent with system time
        const times = ['12:00', '13:00', '13:45', '14:00'];
        const guests = 2; // For Table 2

        console.log(`--- Inspecting Store: ${storeId} ---`);

        const store = await app.documents('api::store.store').findOne({
            documentId: storeId,
            populate: ['tables']
        });

        if (!store) {
            console.error('Store not found!');
            return;
        }

        console.log('Business Hours:', JSON.stringify(store.businessHours, null, 2));
        console.log('Lead Time (Hours):', store.reservationLeadTimeHours);
        console.log('Min Booking Lead Time (Mins):', store.minBookingLeadTime);
        console.log('Closing Rule:', store.bookingClosingRule);
        console.log('Tables:', store.tables.map(t => `${t.name} (Cap:${t.capacity}, Max:${t.maxCapacity}, Active:${t.isActive})`).join(', '));

        const storeService = app.service('api::store.store');

        for (const time of times) {
            console.log(`\nChecking Time: ${time} (Guests: ${guests})`);
            const result = await storeService.checkAvailability(storeId, date, time, guests);
            if (result.available) {
                console.log(`[AVAILABLE] Tables: ${result.candidateTable?.name}`);
            } else {
                console.log(`[UNAVAILABLE] Reason: ${result.reason}`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

inspectStore();
