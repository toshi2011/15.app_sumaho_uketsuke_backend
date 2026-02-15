const strapi = require('@strapi/strapi');

async function verifyCounterLogic() {
    const app = await strapi.createStrapi({ distDir: './dist' }).load();

    try {
        const storeId = 57; // Target Store
        const date = '2026-02-01'; // Future date to avoid conflicts
        const time = '18:00';
        const guests = 2; // Should take 2 counter seats

        console.log('--- specific verification: Counter 10x1 Logic ---');

        // 1. Simulate checkAvailability
        const storeService = app.service('api::store.store');
        const store = await app.db.query('api::store.store').findOne({ where: { id: storeId } });

        if (!store) {
            console.error('Store not found');
            return;
        }

        console.log(`Checking availability for ${guests} guests at ${time}...`);
        const result = await storeService.checkAvailability(
            store.documentId,
            date,
            time,
            guests
        );

        console.log('--- Result ---');
        console.log('Available:', result.available);
        if (result.assignedTables) {
            console.log('Assigned Tables:', result.assignedTables.map(t => t.name).join(', '));
            if (result.assignedTables.length === guests) {
                console.log('SUCCESS: Assigned correct number of seats.');
            } else {
                console.log('WARNING: Assigned seat count mismatch.');
            }
        } else if (result.candidateTable) {
            console.log('Assigned Single Table:', result.candidateTable.name);
        } else {
            console.log('No table assigned.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        // app.destroy(); // Don't destroy if we want to inspect manually or if using running instance
        process.exit(0);
    }
}

verifyCounterLogic();
