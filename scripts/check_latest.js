// Simple script to check latest reservations without serverConfig access
const strapi = require('@strapi/strapi');

async function checkLatestReservations() {
    const app = await strapi.createStrapi({ distDir: './dist' }).load();

    try {
        const reservations = await app.entityService.findMany('api::reservation.reservation', {
            sort: { createdAt: 'desc' },
            limit: 5,
            populate: ['store'],
        });

        console.log('--- Latest 5 Reservations ---');
        reservations.forEach(r => {
            const store = r.store;
            console.log(`[RES] ID:${r.id} DocID:${r.documentId} Status:${r.status} Email:${r.email} StoreDocID:${store?.documentId} isRead:${r.isRead}`);
        });

    } catch (error) {
        console.error('Error fetching reservations:', error);
    }

    process.exit(0);
}

checkLatestReservations();
