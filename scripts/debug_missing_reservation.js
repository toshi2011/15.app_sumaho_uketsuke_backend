
const { createStrapi } = require('@strapi/strapi');

async function findReservation() {
    try {
        const strapi = await createStrapi().load();

        console.log('Searching for reservations on 2025-12-25...');
        const reservations = await strapi.db.query('api::reservation.reservation').findMany({
            where: {
                date: '2025-12-25',
            },
            populate: ['store'],
        });

        if (reservations.length === 0) {
            console.log('No reservations found for 2025-12-25.');
        } else {
            console.log(`Found ${reservations.length} reservations:`);
            reservations.forEach(r => {
                console.log('------------------------------------------------');
                console.log(`ID: ${r.id} (DocID: ${r.documentId})`);
                console.log(`Store: ${r.store ? r.store.name : 'Unassigned'} (ID: ${r.store?.id}, DocID: ${r.store?.documentId})`);
                console.log(`Guest: ${r.guestName} (${r.email})`);
                console.log(`Time: ${r.time}`);
                console.log(`Status: ${r.status}`);
                console.log(`Created At: ${r.createdAt}`);
                console.log(`Reservation Number: ${r.reservationNumber}`);
            });
        }

        console.log('\n--- Checking All Stores ---');
        const stores = await strapi.db.query('api::store.store').findMany();
        stores.forEach(s => {
            console.log(`Store: ${s.name} (ID: ${s.id}, DocID: ${s.documentId}) - Mode: ${s.bookingAcceptanceMode}`);
        });

    } catch (error) {
        console.error('Script Error:', error);
    }

    process.exit(0);
}

findReservation();
