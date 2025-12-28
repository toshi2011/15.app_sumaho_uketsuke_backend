import type { Core } from '@strapi/strapi';

export default {
    /**
     * An asynchronous register function that runs before
     * your application is initialized.
     *
     * This gives you an opportunity to extend code.
     */
    register({ strapi }: { strapi: Core.Strapi }) { },

    /**
     * An asynchronous bootstrap function that runs before
     * your application gets started.
     *
     * This gives you an opportunity to set up your data model,
     * run jobs, or perform some special logic.
     */
    async bootstrap({ strapi }: { strapi: Core.Strapi }) {
        try {
            console.log('Running bootstrap table initialization...');

            const stores = await strapi.entityService.findMany('api::store.store', {
                populate: ['tables'],
                limit: 100, // Explicitly increase limit to ensure we get all stores (default is 25)
            });

            console.log(`Found ${stores.length} stores to check.`);
            // Debug DB connection info (safe)
            const dbConfig = strapi.config.get('database.connection');
            console.log(`[Bootstrap] DB Filename: ${(dbConfig as any).filename}`);

            for (const rawStore of stores) {
                const store = rawStore as any;
                console.log(`[Bootstrap] Processing Store: ${store.name} (ID: ${store.id}, DocID: ${store.documentId})`);
                let needsRefetch = false;

                // Cleanup logic: Remove "Main Table" or huge tables (capacity >= 20)
                if (store.tables && store.tables.length > 0) {
                    for (const table of store.tables) {
                        // Check for the auto-generated "Main Table" or huge capacity indicating old logic
                        if (table.baseCapacity >= 20 || table.capacity >= 20 || table.name.includes('Main Table')) {
                            console.log(`Deleting large/default table "${table.name}" (ID: ${table.id}, DocID: ${table.documentId}) for store ${store.name}`);
                            await strapi.entityService.delete('api::table.table', table.documentId);
                            needsRefetch = true;
                        }
                    }
                }

                // If we deleted tables, or if there were no tables to begin with, we check if we need to seed
                let currentTables = store.tables;
                if (needsRefetch) {
                    const updatedStore = await strapi.entityService.findOne('api::store.store', store.documentId, {
                        populate: ['tables']
                    }) as any;
                    currentTables = updatedStore.tables;
                }

                if (!currentTables || currentTables.length === 0) {
                    console.log(`[Bootstrap] Creating default tables for store ${store.name} (ID: ${store.id})...`);

                    const defaultTables = [
                        { name: 'テーブル1', baseCapacity: 4, maxCapacity: 6, isActive: true, type: 'table' as const },
                        { name: 'テーブル2', baseCapacity: 4, maxCapacity: 6, isActive: true, type: 'table' as const },
                        { name: 'テーブル3', baseCapacity: 2, maxCapacity: 4, isActive: true, type: 'table' as const },
                    ];

                    for (const dt of defaultTables) {
                        try {
                            await strapi.entityService.create('api::table.table', {
                                data: {
                                    ...dt,
                                    store: store.documentId
                                }
                            });
                            console.log(`[Bootstrap] Success: Created "${dt.name}" for store ${store.name}`);
                        } catch (err) {
                            console.error(`[Bootstrap] Error creating "${dt.name}" for store ${store.name}:`, err);
                        }
                    }
                    console.log(`[Bootstrap] Finished creating default tables for ${store.name}`);
                } else {
                    console.log(`[Bootstrap] Store ${store.name} (ID: ${store.id}) already has ${currentTables.length} tables. Skipping.`);
                }
            }

            console.log('[Bootstrap] Table initialization complete.');

        } catch (error) {
            console.error('Error in bootstrap table logic:', error);
        }
    },
};
