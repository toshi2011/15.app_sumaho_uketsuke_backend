
const path = require('path');
const STRAPI_DIR = process.cwd();

async function checkDuplicates() {
    try {
        // Requires Strapi Factory - verifying path
        // In backend root, 'node_modules' is typically present.
        // If running 'npm run develop' works, standard require should work.

        // We need to point to the built application if possible, or source.
        // Strapi 5 usually starts from dist.

        // Try standard require (Node resolution)
        const Strapi = require('@strapi/strapi');

        // Initialize Strapi
        const app = await Strapi({ distDir: path.join(STRAPI_DIR, 'dist') }).load();

        const ids = [63, 64];
        console.log(`Checking reservations with IDs: ${ids.join(', ')}`);

        const reservations = await app.db.query('api::reservation.reservation').findMany({
            where: { id: { $in: ids } },
            populate: ['store'],
        });

        console.log('Found reservations:', JSON.stringify(reservations, null, 2));

        if (reservations.length === 2) {
            const r1 = reservations.find(r => r.id === 63);
            const r2 = reservations.find(r => r.id === 64);

            console.log('--- Comparison ---');
            console.log(`ID: ${r1.id} vs ${r2.id}`);
            console.log(`DocumentId: ${r1.documentId} vs ${r2.documentId}`);
            console.log(`CreatedAt: ${r1.createdAt} vs ${r2.createdAt}`);
            console.log(`TimeDiff: ${new Date(r2.createdAt).getTime() - new Date(r1.createdAt).getTime()} ms`);
            console.log(`GuestName: ${r1.guestName} vs ${r2.guestName}`);
            console.log(`Email: ${r1.email} vs ${r2.email}`);

            // Check if reservationNumber exists
            if (r1.reservationNumber) {
                console.log(`ReservationNumber: ${r1.reservationNumber} vs ${r2.reservationNumber}`);
            } else {
                console.log('ReservationNumber is NULL.');
            }

            if (r1.documentId === r2.documentId) {
                console.log('!!! CRITICAL: Same Document ID for different Integer IDs? (Database corruption or Strapi bug)');
            }
        } else {
            console.log('Could not find both reservations.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkDuplicates();
