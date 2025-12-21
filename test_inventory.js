const storeId = 'tj8k7xirmqvz5mvxjayj978c';
const date = '2025-12-31';

async function createRes(name, time, guests, expectSuccess) {
    const payload = {
        data: {
            store: storeId,
            date: date,
            time: time,
            guests: guests,
            name: name,
            phone: '090-0000-0000',
            email: 'test@example.com',
            status: 'confirmed',
            source: 'web'
        }
    };

    try {
        const res = await fetch('http://localhost:1338/api/reservations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const json = await res.json();

        if (res.ok) {
            if (expectSuccess) {
                console.log(`[PASS] ${name} (${guests}pax): Created. ID: ${json.data.id}`);
                // Verify table assignment (need to populate? Create response doesn't populate relations by default in Strapi 5 usually?)
                // Actually create response usually returns the object. 
                // Let's check logic.
            } else {
                console.log(`[FAIL] ${name} (${guests}pax): Succeeded but EXPECTED FAIL for ${storeId}.`);
            }
        } else {
            if (!expectSuccess) {
                console.log(`[PASS] ${name} (${guests}pax): Rejected as expected. Reason: ${json.error?.message || JSON.stringify(json)}`);
            } else {
                console.log(`[FAIL] ${name} (${guests}pax): Failed but EXPECTED SUCCESS. Reason: ${json.error?.message || JSON.stringify(json)}`);
            }
        }
    } catch (e) {
        console.error(`[ERROR] ${name}: ${e.message}`);
    }
}

async function run() {
    console.log('--- Starting Inventory Check ---');
    // Scenario: Tables are Cap 4, 4, 2. (Total 3 tables).

    // 1. Fill Table 1 (Cap 4)
    await createRes('Test_User_1', '18:00', 4, true);

    // 2. Fill Table 2 (Cap 4)
    await createRes('Test_User_2', '18:00', 4, true);

    // 3. Try to Fill Table ? (Cap 2 remaining) with 4 people -> FAIL
    await createRes('Test_User_3_Fail', '18:00', 4, false);

    // 4. Fill Table 3 (Cap 2) with 2 people -> SUCCESS
    await createRes('Test_User_4', '18:00', 2, true);

    // 5. Try to book more -> FAIL (Full)
    await createRes('Test_User_5_Fail', '18:00', 2, false);
}

run();
