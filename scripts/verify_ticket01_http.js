// Node.js v18+ has native fetch
const BASE_URL = 'http://localhost:1337';
const STORE_ID = 'yxezke33o8wm6q2zq1zrna7d';

async function main() {
    console.log('--- Ticket-01 API Verification ---');
    console.log('Target Backend:', BASE_URL);

    try {
        // 1. Get a valid reservation ID
        console.log('Fetching reservations to find a target...');
        const listRes = await fetch(`${BASE_URL}/api/owner/reservations?pageSize=1`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-store-id': STORE_ID
            }
        });

        if (!listRes.ok) {
            throw new Error(`Failed to list reservations: ${listRes.status} ${listRes.statusText}`);
        }

        const listData = await listRes.json();
        const reservations = listData.data;

        if (!reservations || reservations.length === 0) {
            console.warn('No reservations found. Please create a reservation first to test update.');
            return;
        }

        const targetRes = reservations[0];
        const TARGET_RES_ID = targetRes.id; // DocumentID
        console.log(`Target Reservation Found: ${targetRes.guestName} (ID: ${TARGET_RES_ID})`);

        // 2. Test Check Mode
        console.log('\nTesting Check Mode (Conflict Check)...');
        // We try to move this reservation to a new time or table.
        // For Check mode, we just want to see the API respond.
        // Let's try to assign it to an empty array (should be fine) or current tables.

        const response = await fetch(`${BASE_URL}/api/owner/reservations/${TARGET_RES_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-store-id': STORE_ID
            },
            body: JSON.stringify({
                strategy: 'check',
                // Keep same time/tables to avoid actual changes if we were not checking
                // But specifically for 'check', we want to see if it parses correctly.
                time: targetRes.time,
                guests: targetRes.guests
            })
        });

        const data = await response.json();
        console.log('Check Mode Response:', JSON.stringify(data, null, 2));

        if (data.success) {
            console.log('✅ Check Mode API call successful.');
        } else {
            console.log('⚠️ Check Mode returned failure (Conflict found?). This verifies the API is reachable.');
        }

    } catch (e) {
        console.error('Test failed:', e.message);
        if (e.cause) console.error(e.cause);
    }
}

main();
