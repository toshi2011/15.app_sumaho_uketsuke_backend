const strapi = require('@strapi/strapi');

async function verifySinglePersonLogic() {
    const app = await strapi.createStrapi({ distDir: './dist' }).load();

    try {
        const storeId = 57;
        const date = '2026-04-01'; // Future date
        const time = '12:00';
        const guests = 1;

        console.log('--- Verification: Single Person Counter Priority ---');

        // 1. Check Store Tables
        // Ensure we have counters and tables
        const storeService = app.service('api::store.store');
        const store = await app.documents('api::store.store').findOne({
            documentId: 'kbgudc7dpipl79d2focnm09n', // Using the DocID user mentioned if possible, else 57
            populate: ['tables']
        });

        // If user is referring to ID 52 (Cafe de Paris), I should try to use that if accessible.
        // User mentioned "Cafe de Paris (ID: 52, DocID: kbgudc7dpipl79d2focnm09n)".
        // My environment usually has ID 57. I will check ID 52 availability.

        let targetStoreId = store ? store.documentId : null;
        let targetStoreIdInt = 52;

        if (!targetStoreId) {
            // Fallback to my dev store 57
            console.log('Store 52 not found immediately, trying ID 57...');
            const devStore = await app.db.query('api::store.store').findOne({ where: { id: 57 } });
            if (devStore) {
                targetStoreId = devStore.documentId;
                targetStoreIdInt = 57;
            }
        }

        console.log(`Using Store DocID: ${targetStoreId}`);

        // 2. Simulate Availability Check
        // We assume counters are largely free (migration created 10).

        console.log(`Checking availability for ${guests} guest at ${time}...`);
        const result = await storeService.checkAvailability(
            targetStoreId,
            date,
            time,
            guests
        );

        console.log('--- Result ---');
        console.log('Available:', result.available);

        if (result.assignedTables && result.assignedTables.length > 0) {
            const tableNames = result.assignedTables.map(t => t.name).join(', ');
            console.log('Assigned Tables:', tableNames);
            const isCounter = result.assignedTables.some(t => t.name.includes('カウンター') || t.type === 'counter');

            if (isCounter) {
                console.log('SUCCESS: Assigned to Counter Section.');
            } else {
                console.log('WARNING: Assigned to Table (Not Counter).');
            }
        } else if (result.candidateTable) {
            console.log('Assigned Single Table:', result.candidateTable.name);
            const isCounter = result.candidateTable.name.includes('カウンター') || result.candidateTable.type === 'counter';
            if (isCounter) console.log('SUCCESS: Assigned to Counter.');
            else console.log('WARNING: Assigned to Table.');
        } else {
            console.log('No table assigned.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

verifySinglePersonLogic();
