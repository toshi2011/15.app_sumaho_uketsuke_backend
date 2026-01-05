// Node.js v18+ has native fetch
const BASE_URL = 'http://localhost:1337';
const STORE_ID = 'yxezke33o8wm6q2zq1zrna7d';

async function main() {
    console.log('--- Ticket-02 API Verification (Checkout) ---');
    console.log('Target Backend:', BASE_URL);

    try {
        // 1. Get a valid reservation (Confirmed)
        console.log('Fetching confirmed reservations...');
        const listRes = await fetch(`${BASE_URL}/api/owner/reservations?status=confirmed&pageSize=1`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-store-id': STORE_ID
            }
        });

        if (!listRes.ok) throw new Error(`List failed: ${listRes.status}`);
        const listData = await listRes.json();
        const reservations = listData.data;

        if (!reservations || reservations.length === 0) {
            console.warn('No confirmed reservations found. Create one to test checkout.');
            return;
        }

        const targetRes = reservations[0];
        console.log(`Target: ${targetRes.guestName} (ID: ${targetRes.id}, Time: ${targetRes.time}, Duration: ${targetRes.duration})`);

        // 2. Execute Checkout
        console.log('Executing Checkout...');
        const response = await fetch(`${BASE_URL}/api/owner/reservations/${targetRes.id}/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-store-id': STORE_ID
            }
        });

        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));

        if (data.success) {
            console.log(`✅ Checkout successful. New Duration: ${data.data.duration} min`);
        } else {
            console.log(`❌ Checkout failed. Code: ${response.status}`);
        }

    } catch (e) {
        console.error('Test failed:', e);
    }
}

main();
