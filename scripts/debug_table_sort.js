const { createStrapi } = require('@strapi/strapi');

async function debugTables() {
    const strapi = await createStrapi({ distDir: './dist' }).load();

    // Find store
    const store = await strapi.entityService.findMany('api::store.store', {
        filters: { documentId: 'kbgudc7dpipl79d2focnm09n' }, // Use the known store ID
        populate: ['tables']
    });

    if (!store || store.length === 0) {
        console.log("Store not found");
        process.exit(0);
    }

    const tables = store[0].tables;
    console.log(`Found ${tables.length} tables`);

    // Sort logic from store.ts to see what it sees
    const counterSeats = tables.filter((t) =>
        (t.type === 'counter' || t.name.includes('カウンター')) &&
        (t.maxCapacity === 1 || t.capacity === 1) &&
        t.isActive
    );

    console.log(`Found ${counterSeats.length} Active Counter Seats (Cap 1)`);

    counterSeats.sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999));

    counterSeats.forEach(t => {
        console.log(`- ${t.name} (ID: ${t.id}): SortOrder=${t.sortOrder} (${typeof t.sortOrder}), Type=${t.type}`);
    });

    // Check sequentiality
    for (let i = 0; i <= counterSeats.length - 2; i++) { // Check for pair
        const t1 = counterSeats[i];
        const t2 = counterSeats[i + 1];
        const val1 = Number(t1.sortOrder);
        const val2 = Number(t2.sortOrder);
        const diff = val2 - val1;
        console.log(`[${t1.name}(${val1}), ${t2.name}(${val2})] Diff: ${diff} -> ${diff === 1 ? 'Sequential' : 'GAP'}`);
    }

    process.exit(0);
}

debugTables();
