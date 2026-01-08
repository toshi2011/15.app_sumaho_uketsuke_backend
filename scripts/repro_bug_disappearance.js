const strapi = require('@strapi/strapi');

async function reproBug() {
    const app = await strapi.createStrapi({ distDir: './dist' }).load();

    try {
        const storeId = 57; // Use 57 or 52 as user said (but 57 is my dev store)
        const date = '2026-03-01'; // Far future
        const time = '12:00';

        // 0. Ensure Store has Counter Seats (C1..C10)
        // (Assuming fixCounters ran successfully)

        const tables = await app.documents('api::table.table').findMany({
            filters: { store: { id: storeId }, name: { $contains: 'カウンター' }, isActive: true },
            // sort: 'sortOrder:asc' // removing sort to avoid potential error if field issue
        });

        if (tables.length < 3) {
            console.error('Not enough counter tables found. Run fixCounters first.');
            return;
        }
        const [c1, c2, c3] = tables;
        console.log(`Using Counters: ${c1.name}, ${c2.name}, ${c3.name}`);

        // 1. Create Res A (2 people, C1, C2, Published)
        console.log('--- Creating Res A (2p, C1+C2, Published) ---');
        let resA = await app.documents('api::reservation.reservation').create({
            data: {
                name: 'Res A (Timeline Victim)',
                guests: 2,
                date,
                time,
                duration: 90,
                store: { id: storeId }, // relation can accept ID? or docID?
                assignedTables: [c1.documentId, c2.documentId],
                status: 'confirmed'
            },
            status: 'published'
        });
        console.log(`Res A created: ${resA.documentId} (Tables: ${resA.assignedTables?.length || '?'})`);

        // 2. Create Res B (1 person, No Table, Draft/Modified?)
        // User said "Modified". Likely Draft exist.
        console.log('--- Creating Res B (1p, No Table, Draft) ---');
        let resB = await app.documents('api::reservation.reservation').create({
            data: {
                name: 'Res B (The Overwriter)',
                guests: 1,
                date,
                time,
                duration: 90,
                store: { id: storeId },
                status: 'pending' // pending
            },
            status: 'draft'
        });
        console.log(`Res B created: ${resB.documentId}`);

        // 3. Force Update Res B to C3 (or maybe [C1, C2, C3] if collision happened?)
        // User said "Tried to put into 3rd seat". "Conflict detected".
        // If conflict detected, maybe they tried C1? 
        // Or maybe checkAvailability returned conflict?
        // Let's try to Force Update Res B to C3.

        console.log('--- Force Updating Res B to C3 ---');
        // Logic inside owner-reservation controller 'update' (strategy='force')
        // We will call the controller logic (mocking ctx) OR direct DB manipulate if simpler?
        // Better to use Controller logic to check side effects.

        // Mock Context
        const ctx = {
            request: {
                header: { 'x-store-id': String(storeId) },
                body: {
                    strategy: 'force',
                    assignedTables: [c3.documentId], // Only C3
                    // If user encountered conflict, maybe they tried to assign [c1]? 
                    // Let's stick to user story: "Tried to put into 3rd seat".
                }
            },
            params: { id: resB.documentId },
            badRequest: (msg) => console.log('BadRequest:', msg),
            notFound: (msg) => console.log('NotFound:', msg),
            internalServerError: (msg) => console.log('ServerError:', msg),
            body: null,
            send: (data) => ctx.body = data
        };

        const controller = app.controller('api::owner-reservation.owner-reservation');
        await controller.update(ctx);

        console.log('Update Result:', ctx.body ? JSON.stringify(ctx.body).slice(0, 100) + '...' : 'No Body');

        // 4. Check Res A
        console.log('--- Verifying Res A Integrity ---');
        const checkA = await app.documents('api::reservation.reservation').findOne({
            documentId: resA.documentId,
            populate: ['assignedTables']
        });

        if (!checkA) {
            console.error('CRITICAL: Res A NOT FOUND!');
        } else {
            console.log(`Res A Status: ${checkA.status}`);
            const tableNames = checkA.assignedTables?.map(t => t.name).join(', ') || 'NONE';
            console.log(`Res A Tables: ${tableNames}`);

            if (checkA.assignedTables.length === 2 &&
                checkA.assignedTables.find(t => t.documentId === c1.documentId) &&
                checkA.assignedTables.find(t => t.documentId === c2.documentId)) {
                console.log('SUCCESS: Res A is intact.');
            } else {
                console.error('FAILURE: Res A lost tables or changed!');
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

reproBug();
