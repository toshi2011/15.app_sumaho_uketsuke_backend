const { createStrapi } = require('@strapi/strapi');

async function checkStoreTables() {
    const app = await createStrapi({ distDir: './dist' }).load();

    // Target Store: イタリアン・トラットリア
    const STORE_DOC_ID = 'yxezke33o8wm6q2zq1zrna7d';

    try {
        const store = await app.entityService.findOne('api::store.store', STORE_DOC_ID, {
            populate: ['tables']
        });

        if (!store) {
            console.error('Store not found!');
            return;
        }

        console.log(`Store: ${store.name} (ID: ${store.id})`);
        console.log('--- Tables ---');
        if (store.tables && store.tables.length > 0) {
            store.tables.forEach(t => {
                console.log(`- [${t.documentId}] ${t.name} (Type: ${t.type || 'N/A'}, Capacity: ${t.baseCapacity}, Max: ${t.maxCapacity}, Active: ${t.isActive})`);
            });
        } else {
            console.log('No tables found.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        app.destroy();
    }
}

checkStoreTables();
