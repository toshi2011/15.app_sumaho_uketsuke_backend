const strapi = require('@strapi/strapi');
const fs = require('fs');

async function migrateCounters() {
    const app = await strapi.createStrapi({ distDir: './dist' }).load();
    let log = '';
    const logFile = 'migration.log';

    const print = (msg) => {
        console.log(msg);
        log += msg + '\n';
    };

    try {
        const storeId = 'kbgudc7dpipl79d2focnm09n'; // Document ID
        print(`--- Migrating Counters for Store: ${storeId} ---`);

        // 1. Get Store using EntityService (requires ID, not DocumentID usually, but let's try finding via filters using documentId)
        const stores = await app.entityService.findMany('api::store.store', {
            filters: { documentId: storeId },
            populate: ['tables']
        });
        const store = stores[0];

        if (!store) throw new Error('Store not found');

        const tables = store.tables;
        const countersToMigrate = tables.filter(t =>
            (t.type === 'counter' || t.name.includes('カウンター')) &&
            (t.capacity > 1 || t.maxCapacity > 1) &&
            t.isActive // Only migrate active ones
        );

        print(`Found ${countersToMigrate.length} counters to migrate.`);

        for (const oldTable of countersToMigrate) {
            const capacity = oldTable.capacity || oldTable.maxCapacity || 4;
            print(`Migrating: ${oldTable.name} (Cap: ${capacity})`);

            const newTableIds = [];

            for (let i = 1; i <= capacity; i++) {
                const newName = `${oldTable.name}-${i}`;

                // Check if already exists to avoid duplicates
                const existing = await app.entityService.findMany('api::table.table', {
                    filters: {
                        name: newName,
                        store: { documentId: storeId }
                    }
                });

                let created;
                if (existing.length > 0) {
                    print(`  Skipping: ${newName} (Already exists)`);
                    created = existing[0];
                } else {
                    created = await app.entityService.create('api::table.table', {
                        data: {
                            name: newName,
                            capacity: 1,
                            maxCapacity: 1,
                            minCapacity: 1,
                            type: 'counter',
                            isActive: true,
                            store: store.id, // EntityService usually uses numeric ID for relation
                            sortOrder: (oldTable.sortOrder || 100) * 10 + i
                        }
                    });
                    print(`  Created: ${newName} (ID: ${created.id})`);
                }
                newTableIds.push(created.id);
            }

            // Re-assign Reservations
            const reservations = await app.entityService.findMany('api::reservation.reservation', {
                filters: {
                    store: { documentId: storeId },
                    assignedTables: { id: oldTable.id } // Use numeric ID
                },
                populate: ['assignedTables']
            });

            print(`  Found ${reservations.length} reservations to re-assign.`);

            for (const res of reservations) {
                const needed = Math.min(res.guests || 1, capacity);
                const assignedIds = newTableIds.slice(0, needed);

                await app.entityService.update('api::reservation.reservation', res.id, {
                    data: {
                        assignedTables: assignedIds
                    }
                });
                print(`    Res [${res.id}]: Re-assigned.`);
            }

            // Archive Old Table
            await app.entityService.update('api::table.table', oldTable.id, {
                data: {
                    isActive: false,
                    name: `${oldTable.name}_ARCHIVED`
                }
            });
            print(`  Archived ${oldTable.name}`);
        }

        print('Migration Completed Successfully.');

    } catch (e) {
        print(`Migration Failed: ${e.message}`);
        if (e.details) print(`Details: ${JSON.stringify(e.details)}`);
        console.error(e);
    } finally {
        fs.writeFileSync(logFile, log);
        process.exit(0);
    }
}

migrateCounters();
