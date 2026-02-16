/**
 * `store-context` middleware
 */

import { Core } from '@strapi/strapi';

export default (config, { strapi }: { strapi: Core.Strapi }) => {
    return async (ctx, next) => {
        const storeId = ctx.request.header['x-store-id'];


        if (storeId) {
            // Set the store context
            ctx.state.storeId = storeId;

            // EXCEPTION: Do not auto-filter "Store" API itself.
            // When fetching /api/stores, we want the list of stores, not "stores belonging to store X".
            if (!ctx.request.url.includes('/api/stores')) {
                // Auto-Filter Injection for Find/FindOne operations using standard Strapi Query
                if (!ctx.query) ctx.query = {};
                if (!ctx.query.filters) ctx.query.filters = {};

                // FIX: If store filter is already present in query (e.g. from frontend API),
                // do NOT override it with x-store-id header.
                const existingStoreFilter = (ctx.query.filters as any).store;

                if (!existingStoreFilter) {
                    // Merge store filter
                    // Note: We cast to any to avoid strict type checks on dynamic query object
                    (ctx.query.filters as any).store = { documentId: storeId };
                    strapi.log.info(`[StoreContext] Auto-injected filter for Store: ${storeId}`);
                } else {
                    strapi.log.debug(`[StoreContext] Skipping auto-injection: explicit store filter found in query.`);
                }
            }
        }

        await next();
    };
};
