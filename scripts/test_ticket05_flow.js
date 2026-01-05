// Node.js v18+ native fetch
const BASE_URL = 'http://localhost:1337';
const STORE_ID = 'yxezke33o8wm6q2zq1zrna7d';

async function main() {
    console.log('--- Ticket-05: Checkout Flow Verification ---');

    try {
        // 1. Setup a Fixed Valid Time (Future) to ensure creation succeeds
        // Using Today 18:00 (Dinner Time) which is generally open.
        // Even if now is 00:00 (before 18:00), checkout will clamp duration to 15min.
        const now = new Date();
        const dateStr = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');

        const timeStr = '18:00'; // Fixed Dinner Time

        console.log(`Creating reservation for: ${dateStr} ${timeStr} (Future/Valid Business Hour)`);
        console.log('Note: Creating a future reservation to bypass business hour/past checks.');

        // 2. Create a Confirmed Reservation (simulating Owner creation)
        const createRes = await fetch(`${BASE_URL}/api/reservations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add Auth if needed, but often Public for creation or basic setup
            },
            body: JSON.stringify({
                data: {
                    date: dateStr,
                    time: timeStr + ':00.000',
                    name: 'Checkout Test User',
                    guests: 2,
                    status: 'confirmed',
                    source: 'owner',
                    store: STORE_ID,
                    email: 'test_checkout@example.com'
                }
            })
        });

        if (!createRes.ok) {
            throw new Error(`Create failed: ${createRes.status} ${await createRes.text()}`);
        }

        const createData = await createRes.json();
        const resId = createData.data.documentId; // Strapi 5 uses documentId
        // console.log('Created Res:', createData.data);
        console.log(`✅ Reservation Created. ID: ${resId}`);

        // 3. Execute Checkout
        console.log('Executing Checkout...');
        const checkoutRes = await fetch(`${BASE_URL}/api/owner/reservations/${resId}/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-store-id': STORE_ID
            }
        });

        const checkoutData = await checkoutRes.json();

        if (checkoutData.success) {
            console.log(`✅ Checkout Successful!`);
            console.log(`   Updated Duration: ${checkoutData.data.duration} min`);
            console.log(`   Status: ${checkoutData.data.status}`);
        } else {
            console.error(`❌ Checkout Failed:`, checkoutData);
        }

    } catch (e) {
        console.error('Test Error:', e);
    }
}

main();
