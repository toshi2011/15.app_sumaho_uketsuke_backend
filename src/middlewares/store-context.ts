/**
 * `store-context` middleware
 * 店舗コンテキストの自動注入とスーパー管理者バイパス機能
 * + User-Store 所有権検証（テナント分離）
 */

import { Core } from '@strapi/strapi';

/**
 * スーパー管理者かどうかを判定する
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
        const superAdmin = isSuperAdmin(ctx);

        // オーナー向けAPIパスかどうかを判定
        const isOwnerApi = ctx.request.url.includes('/api/owner/');

        if (superAdmin) {
            ctx.state.isSuperAdmin = true;
            strapi.log.info(`[StoreContext] スーパー管理者アクセス: フィルタ自動注入をバイパス`);
        }

        if (storeId) {
            // --- 所有権検証: テナント分離の徹底 ---
            if (!superAdmin) {
                const authHeader = ctx.request.header['authorization'];

                // 【強化防御1】オーナーAPIなのに認証ヘッダーがない場合は「強制ブロック」
                if (isOwnerApi && (!authHeader || !authHeader.startsWith('Bearer '))) {
                    strapi.log.warn(`[StoreContext] 未認証でオーナーAPIへのアクセスをブロック: ${ctx.request.url}`);
                    ctx.status = 401;
                    ctx.body = { error: { message: 'Authentication is required to access owner APIs.', name: 'UnauthorizedError' } };
                    return; // 👈 ここで必ず処理を終了させ、コントローラーを実行させない
                }

                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.substring(7);
                    try {
                        const payload = await strapi
                            .plugin('users-permissions')
                            .service('jwt')
                            .verify(token);

                        const user = await strapi
                            .query('plugin::users-permissions.user')
                            .findOne({
                                where: { id: payload.id },
                                populate: ['stores'],
                            });

                        if (!user) {
                            ctx.status = 401;
                            ctx.body = { error: { message: 'User not found.', name: 'UnauthorizedError' } };
                            return;
                        }

                        // 【強化防御2】Strapi 5のDBレイヤープロパティ違いを吸収 (documentId, document_id, id)
                        const hasAccess =
                            user.stores &&
                            user.stores.some(
                                (store) => store.documentId === storeId || store.document_id === storeId || store.id === Number(storeId)
                            );

                        // 【強化防御3】アクセス権がない場合は 403 Forbidden で「強制ブロック」
                        if (!hasAccess) {
                            strapi.log.warn(`[StoreContext] 所有権検証失敗: User ${user.id} は Store ${storeId} へのアクセス権がありません`);
                            ctx.status = 403;
                            ctx.body = { error: { message: 'You do not have permission to access this store.', name: 'ForbiddenError' } };
                            return; // 👈 ここで必ず処理を終了させる
                        }

                        strapi.log.info(`[StoreContext] 所有権検証OK: User ${user.id} → Store ${storeId}`);
                    } catch (err) {
                        strapi.log.warn(`[StoreContext] JWT検証失敗: ${(err as Error).message}`);
                        ctx.status = 401;
                        ctx.body = { error: { message: 'Invalid or expired token.', name: 'UnauthorizedError' } };
                        return;
                    }
                }
            }

            // 店舗コンテキストをセット
            ctx.state.storeId = storeId;

            // スーパー管理者以外はフィルタを自動注入
            if (!superAdmin && !ctx.request.url.includes('/api/stores')) {
                if (!ctx.query) ctx.query = {};
                if (!ctx.query.filters) ctx.query.filters = {};

                const existingStoreFilter = (ctx.query.filters as any).store;

                if (!existingStoreFilter) {
                    (ctx.query.filters as any).store = { documentId: storeId };
                    strapi.log.info(`[StoreContext] Auto-injected filter for Store: ${storeId}`);
                } else {
                    strapi.log.debug(`[StoreContext] Skipping auto-injection: explicit store filter found in query.`);
                }
            }
        } else if (isOwnerApi && !superAdmin) {
            // 【強化防御4】オーナーAPIなのに x-store-id がない場合もブロック
            strapi.log.warn(`[StoreContext] x-store-id なしでオーナーAPIへのアクセスをブロック: ${ctx.request.url}`);
            ctx.status = 400;
            ctx.body = { error: { message: 'X-Store-ID header is required for owner APIs.', name: 'BadRequestError' } };
            return;
        }

        // 全てのチェックを通過した場合のみ、後続（コントローラー）へ処理を移す
        await next();
    };
};