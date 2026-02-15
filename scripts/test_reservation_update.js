console.log('Starting script...');
try {
    const strapiFactory = require('@strapi/strapi');
    console.log('Required strapi factory');
    const { createStrapi } = strapiFactory;

    async function main() {
        console.log('Creating Strapi instance...');
        const app = await createStrapi({ distDir: './dist' }).load();
        console.log('Strapi loaded.');

        const STORE_DOC_ID = 'yxezke33o8wm6q2zq1zrna7d';
        const TEST_DATE = '2025-12-30'; // 使用するテスト日付

        try {
            console.log('--- 1. Setup Test Data ---');
            // 店舗取得
            const store = await app.db.query('api::store.store').findOne({ where: { documentId: STORE_DOC_ID }, populate: ['tables'] });
            const tables = store.tables;
            const table1 = tables[0]; // Counter 1 (Cap 4)
            const table2 = tables[1]; // Table 1 (Cap 4)

            if (!table1 || !table2) {
                throw new Error('Need at least 2 tables for this test');
            }

            console.log(`Table A: ${table1.name} (ID: ${table1.id})`);
            console.log(`Table B: ${table2.name} (ID: ${table2.id})`);

            // Clean up pervious test data
            await app.db.query('api::reservation.reservation').deleteMany({
                where: { date: TEST_DATE, store: store.id }
            });

            // 予約1作成 (Aさん: Table 1, 18:00)
            const resA = await app.service('api::reservation.reservation').create({
                data: {
                    reservationNumber: 'RES-A',
                    date: TEST_DATE,
                    time: '18:00',
                    guests: 2,
                    status: 'confirmed',
                    guestName: 'User A',
                    email: 'a@example.com',
                    store: store.id,
                    assignedTables: [table1.id]
                }
            });
            console.log(`Created Res A (ID: ${resA.documentId}) on ${table1.name}`);

            // 予約2作成 (Bさん: Table 2, 18:00)
            const resB = await app.service('api::reservation.reservation').create({
                data: {
                    reservationNumber: 'RES-B',
                    date: TEST_DATE,
                    time: '18:00',
                    guests: 2,
                    status: 'confirmed',
                    guestName: 'User B',
                    email: 'b@example.com',
                    store: store.id,
                    assignedTables: [table2.id]
                }
            });
            console.log(`Created Res B (ID: ${resB.documentId}) on ${table2.name}`);


            console.log('\n--- 2. Test Check Mode (Conflict) ---');
            // AさんをTable 2 (Bさんの席) に移動しようとする
            const ctxCheck = {
                params: { id: resA.documentId },
                request: {
                    header: { 'x-store-id': STORE_DOC_ID },
                    body: {
                        assignedTables: [table2.documentId], // Target Table 2
                        time: '18:00',
                        strategy: 'check'
                    }
                },
                badRequest: (msg) => console.log('BadRequest:', msg),
                notFound: (msg) => console.log('NotFound:', msg),
                internalServerError: (msg) => console.log('ServerError:', msg),
                body: null
            };

            await app.controller('api::owner-reservation.owner-reservation').update(ctxCheck);
            console.log('Check Result:', JSON.stringify(ctxCheck.body, null, 2));


            console.log('\n--- 3. Test Swap Mode ---');
            // AさんとBさんを入れ替える
            const ctxSwap = {
                params: { id: resA.documentId },
                request: {
                    header: { 'x-store-id': STORE_DOC_ID },
                    body: {
                        assignedTables: [table2.documentId], // A wants table 2
                        time: '18:00',
                        strategy: 'swap',
                        targetReservationId: resB.documentId // Swap with B
                    }
                },
                badRequest: (msg) => console.log('BadRequest:', msg),
                notFound: (msg) => console.log('NotFound:', msg),
                internalServerError: (msg) => console.log('ServerError:', msg),
                body: null
            };

            await app.controller('api::owner-reservation.owner-reservation').update(ctxSwap);
            console.log('Swap Result:', ctxSwap.body);

            // 検証
            const updatedA = await app.db.query('api::reservation.reservation').findOne({ where: { id: resA.id }, populate: ['assignedTables'] });
            const updatedB = await app.db.query('api::reservation.reservation').findOne({ where: { id: resB.id }, populate: ['assignedTables'] });

            console.log(`Updated A Table: ${updatedA.assignedTables[0].name} (Expected: ${table2.name})`);
            console.log(`Updated B Table: ${updatedB.assignedTables[0].name} (Expected: ${table1.name})`);


        } catch (e) {
            console.error(e);
        } finally {
            process.exit(0);
        }
    }

    main();
} catch (e) {
    console.error('Initialization Error:', e);
}
