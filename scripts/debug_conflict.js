const Strapi = require('@strapi/strapi');

async function main() {
    // Strapiの初期化 (distから)
    const strapi = await Strapi({ distDir: './dist' }).load();

    try {
        console.log('--- Starting Debug Script: Reservation Update (Strapi v5) ---');

        // 1. 店舗とテーブルの取得
        // Store
        const stores = await strapi.db.query('api::store.store').findMany({ limit: 1 });
        if (stores.length === 0) {
            console.error('No stores found');
            process.exit(1);
        }
        const store = stores[0];
        console.log(`Store: ${store.name} (ID: ${store.id}, DocID: ${store.documentId})`);

        // Tables
        const tables = await strapi.db.query('api::table.table').findMany({
            where: { store: store.id },
            limit: 2
        });
        if (tables.length < 2) {
            console.error('Need at least 2 tables to test swap/update');
            process.exit(1);
        }
        const table1 = tables[0];
        const table2 = tables[1];
        console.log(`Table 1: ${table1.name} (ID: ${table1.id}, DocID: ${table1.documentId})`);
        console.log(`Table 2: ${table2.name} (ID: ${table2.id}, DocID: ${table2.documentId})`);

        // 2. 予約作成 (最初はTable 1)
        const now = new Date();
        const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        const dateStr = now.toISOString().split('T')[0];

        console.log(`Creating Reservation for ${dateStr} ${timeStr} on Table 1...`);

        let reservation = await strapi.db.query('api::reservation.reservation').create({
            data: {
                name: 'Debug User',
                date: dateStr,
                time: timeStr,
                guests: 2,
                status: 'pending',
                source: 'web',
                store: store.id,
                assignedTables: [table1.id] // Create with Numeric ID
            },
            populate: ['assignedTables']
        });

        console.log('Created Reservation:', reservation.id);
        console.log('Initial Assigned Tables:', reservation.assignedTables.map(t => t.documentId));

        // 3. Update using request payload simulation
        // The controller uses `assignedTables` as Document IDs from request body,
        // then converts to Numeric IDs, then calls db.query.update with Numeric IDs.

        const targetTableDocIds = [table2.documentId];
        console.log(`\nAttempting Update to Table 2 (DocID: ${table2.documentId})...`);

        // Simulate Controller Logic:
        // a. Resolve Document IDs to Numeric IDs
        const resolvedTables = await strapi.db.query('api::table.table').findMany({
            where: { documentId: { $in: targetTableDocIds } }
        });
        const newAssignedTables = resolvedTables.map(t => t.id);
        console.log('Resolved Numeric IDs for Update:', newAssignedTables);

        if (newAssignedTables.length === 0) {
            console.error('Failed to resolve table Document IDs');
        }

        // b. Perform Update with Numeric IDs
        const updated = await strapi.db.query('api::reservation.reservation').update({
            where: { id: reservation.id },
            data: {
                assignedTables: newAssignedTables
            },
            populate: ['assignedTables']
        });

        console.log('\n--- Update Result ---');
        console.log('Updated Reservation ID:', updated.id);
        console.log('Updated Assigned Tables:', updated.assignedTables.map(t => t.name));

        if (updated.assignedTables.length === 1 && updated.assignedTables[0].id === table2.id) {
            console.log('SUCCESS: Table updated correctly.');
        } else {
            console.error('FAILURE: Table NOT updated correctly.');
            console.log('Expected:', table2.name);
            console.log('Actual:', updated.assignedTables.map(t => t.name));
        }

        // 4. Clean up
        await strapi.db.query('api::reservation.reservation').delete({ where: { id: reservation.id } });

    } catch (error) {
        console.error('Fatal Error:', error);
    } finally {
        // strapi.stop() causes issues in script mode sometimes if not handled well, but try it.
        // Or just exit.
        process.exit(0);
    }
}

main();
