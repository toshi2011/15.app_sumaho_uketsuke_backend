
const fetch = require('node-fetch'); // Typically available or use native fetch if Node 18+

// Helper to get a store ID first (we'll just pick the first one)
async function getStoreId() {
    // This assumes we can list stores or know one. 
    // Since this is a public API test, we might need a known ID.
    // We'll try to use the one from the check script if available, or just hardcode if we knew it.
    // For now, let's try to fetch stores via public API if available, or we check the DB directly via Strapi script first?
    // Let's use the Strapi internal script approach again to be safe and set the store mode too.
}

const { createStrapi } = require('@strapi/strapi');

async function verifyFix() {
    try {
        const strapi = await createStrapi().load();

        // 1. Get a store and set it to 'auto' mode
        const stores = await strapi.db.query('api::store.store').findMany({ limit: 1 });
        if (stores.length === 0) {
            console.log('No stores found');
            process.exit(1);
        }
        const store = stores[0];
        console.log(`Testing with store: ${store.name} (DocID: ${store.documentId})`);

        // Update store to auto
        await strapi.entityService.update('api::store.store', store.documentId, {
            data: { bookingAcceptanceMode: 'auto' }
        });
        console.log('Set store to auto mode.');

        // 2. Simulate Controller Logic call (or calls via internal service to mimic it? No, we changed the controller.)
        // We can't easily curl localhost from inside this script without running server. 
        // The server IS running (npm run develop). 
        // so we can use fetch against localhost:1337.

        // We need the documentId for the public API usually? Or ID?
        // Public API usually takes documentId in these new versions? 
        // The controller says: const { storeId } = ctx.request.body; ... where: { documentId: storeId }
        // So it expects Document ID.

        const payload = {
            storeId: store.documentId,
            guestName: 'Auto Confirm Test',
            email: 'autoconfirm@example.com',
            phone: '090-1234-5678',
            date: '2025-12-28', // Future date
            time: '18:00',
            guests: 2
        };

        console.log('Sending request to public API...');
        const response = await fetch('http://localhost:1337/api/public/reservations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('API Response:', JSON.stringify(result, null, 2));

        if (result.data && result.data.status === 'confirmed') {
            console.log('SUCCESS: Reservation was auto-confirmed!');
        } else {
            console.log('FAILURE: Reservation was NOT auto-confirmed. Status:', result.data?.status);
        }

    } catch (error) {
        console.error('Verification Error:', error);
    }

    process.exit(0);
}

verifyFix();
