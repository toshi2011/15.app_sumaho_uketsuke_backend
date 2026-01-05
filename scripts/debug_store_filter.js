
const Strapi = require('@strapi/strapi');

async function debugStoreFilter() {
    const strapi = await Strapi.createStrapi({ distDir: './dist' }).load();

    try {
        const storeDocId = 'yxezke33o8wm6q2zq1zrna7d';

        console.log('--- Debugging Store Filter ---');

        // 1. Get Store
        const store = await strapi.db.query('api::store.store').findOne({ where: { documentId: storeDocId } });
        if (!store) { console.error('Store not found'); return; }

        console.log(`Store ID: ${store.id}, DocumentID: ${store.documentId}`);

        // 2. Query Reservations by Store ID (Numeric)
        const countId = await strapi.db.query('api::reservation.reservation').count({
            where: { store: { id: store.id } }
        });
        console.log(`Count with store: { id: ${store.id} }: ${countId}`);

        // 3. Query Reservations by Store DocID
        const countDocId = await strapi.db.query('api::reservation.reservation').count({
            where: { store: { documentId: store.documentId } }
        });
        console.log(`Count with store: { documentId: '${store.documentId}' }: ${countDocId}`);

        // 4. Query Reservations by Flat Store ID
        const countFlat = await strapi.db.query('api::reservation.reservation').count({
            where: { store: store.id }
        });
        console.log(`Count with store: ${store.id}: ${countFlat}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

debugStoreFilter();
