
// Node 20+ has global fetch


async function verifyFix() {
    try {
        // 1. Get a store ID from public API
        console.log('Fetching stores...');
        const storesResponse = await fetch('http://127.0.0.1:1337/api/stores');

        const storesData = await storesResponse.json();

        if (!storesData.data || storesData.data.length === 0) {
            console.error('No stores found via API.');
            process.exit(1);
        }

        const store = storesData.data[0];
        console.log(`Using Store: ${store.attributes?.name || 'Unknown'} (DocumentId: ${store.documentId})`);

        // Note: We cannot easily update the store to 'auto' via public API.
        // We assume it is 'auto' (default) OR we accept whatever it is.
        // Ideally we want to see if we satisfy the "No Double Email" condition regardless of status.
        // And if it IS auto, we want to see "Confirmed".

        const payload = {
            storeId: store.documentId,
            guestName: 'Verification Guest',
            email: 'verify@example.com', // Must provide email to trigger email logic
            phone: '090-9999-9999',
            date: '2025-12-29',
            time: '19:00',
            guests: 2
        };

        console.log('Creating reservation...');
        const response = await fetch('http://127.0.0.1:1337/api/public/reservations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('API Response:', JSON.stringify(result, null, 2));

        if (result.error) {
            console.error('API Error:', result.error);
        } else {
            console.log('Reservation created successfully.');
            console.log('Status:', result.data.status);
        }

    } catch (error) {
        console.error('Script Error:', error);
    }
}

verifyFix();
