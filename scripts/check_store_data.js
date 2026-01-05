const { createStrapi } = require('@strapi/strapi');

async function main() {
    // Correct initialization based on verify_logic_optimization.js
    const app = await createStrapi({ distDir: './dist' }).load();

    const STORE_DOC_ID = 'yxezke33o8wm6q2zq1zrna7d';

    console.log('--- Inspecting Store and Tables ---');
    try {
        const store = await app.db.query('api::store.store').findOne({
            where: { documentId: STORE_DOC_ID },
            populate: ['tables']
        });

        if (!store) {
            console.error(`Store with DocID ${STORE_DOC_ID} not found.`);
            // List all stores to see what's available
            const allStores = await app.db.query('api::store.store').findMany({});
            console.log('Available stores:', allStores.map(s => ({ id: s.id, docId: s.documentId, name: s.name })));
        } else {
            console.log(`Store Found: ${store.name} (ID: ${store.id})`);
            const tables = store.tables;
            if (!tables || tables.length === 0) {
                console.log('No tables associated with this store.');
            } else {
                console.log(`Tables (${tables.length}):`);
                tables.sort((a, b) => a.id - b.id).forEach(t => {
                    console.log(` - ID: ${t.id}, DocID: ${t.documentId}, Name: "${t.name}", Type: "${t.type}", Cap: ${t.baseCapacity}, Max: ${t.maxCapacity}, isActive: ${t.isActive}`);
                });
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

main();
