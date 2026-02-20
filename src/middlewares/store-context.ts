/**
 * `store-context` middleware
 * 店舗コンテキストの自動注入とスーパー管理者バイパス機能
 */

import { Core } from '@strapi/strapi';

/**
 * スーパー管理者かどうかを判定する
 * x-super-admin-key ヘッダーが環境変数 SUPER_ADMIN_KEY と一致すればバイパスを許可
 */
function isSuperAdmin(ctx): boolean {
    const superAdminKey = process.env.SUPER_ADMIN_KEY;
    if (!superAdminKey) return false;
    const headerKey = ctx.request.header['x-super-admin-key'];
    return headerKey === superAdminKey;
}

export default (config, { strapi }: { strapi: Core.Strapi }) => {
    return async (ctx, next) => {
        const storeId = ctx.request.header['x-store-id'];

        // スーパー管理者判定：trueの場合はストアフィルタ自動注入をスキップ
        const superAdmin = isSuperAdmin(ctx);
        if (superAdmin) {
            ctx.state.isSuperAdmin = true;
            strapi.log.info(`[StoreContext] スーパー管理者アクセス: フィルタ自動注入をバイパス`);
        }

        if (storeId) {
            // Set the store context
            ctx.state.storeId = storeId;

            // スーパー管理者の場合はフィルタ自動注入をスキップ（全店舗アクセス可能）
            if (superAdmin) {
                strapi.log.info(`[StoreContext] スーパー管理者: Store ${storeId} のコンテキスト設定のみ（フィルタなし）`);
            }
            // EXCEPTION: Do not auto-filter "Store" API itself.
            // When fetching /api/stores, we want the list of stores, not "stores belonging to store X".
            else if (!ctx.request.url.includes('/api/stores')) {
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
