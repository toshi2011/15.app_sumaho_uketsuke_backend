import { factories } from '@strapi/strapi';
import { StoreConfig, buildCategoryPreset } from '../../../core/config/StoreConfig';
import { StoreDomain, AvailableSlot } from '../../../core/domain/StoreDomain';

export default factories.createCoreController('api::store.store', ({ strapi }) => ({
    /**
     * POST /api/stores
     * 店舗作成時にカテゴリに応じたプリセット（営業時間・所要時間等）を注入する
     */
    async create(ctx) {
        const body = ctx.request.body;
        const data = body?.data || body;
        const category = data?.category || 'restaurant';

        // StoreConfig からカテゴリ別プリセットを取得
        const preset = buildCategoryPreset(category);

        // プリセットをベースに、リクエスト内の明示的な値を優先マージ
        const mergedData = {
            ...preset,
            ...data,
            // businessHours は深いマージが必要
            businessHours: {
                ...preset.businessHours,
                ...(data.businessHours || {}),
            },
        };

        // Strapi v5 の body 形式に戻す
        if (body?.data) {
            ctx.request.body.data = mergedData;
        } else {
            ctx.request.body = mergedData;
        }

        strapi.log.info(`[StoreController] 店舗作成: category=${category} プリセット注入完了`);

        // 親の create を呼び出し（Strapi 標準の保存処理）
        return await super.create(ctx);
    },

    /**
     * POST /api/stores/super-admin/bulk-create
     * スーパー管理者による一括店舗作成用（Strapiポリシーガードをバイパス）
     */
    async superAdminCreate(ctx) {
        const adminKey = ctx.request.headers['x-super-admin-key'];
        const validKey = process.env.SUPER_ADMIN_KEY;

        if (!validKey || adminKey !== validKey) {
            return ctx.forbidden('Invalid Super Admin Key');
        }

        const body = ctx.request.body;
        const data = body?.data || body;
        const category = data?.category || 'restaurant';

        const preset = buildCategoryPreset(category);

        const mergedData = {
            ...preset,
            ...data,
            businessHours: {
                ...preset.businessHours,
                ...(data.businessHours || {}),
            },
            // 自動的に公開状態 (Published) にする
            publishedAt: new Date(),
        };

        try {
            const createdStore = await strapi.entityService.create('api::store.store', {
                data: mergedData,
            });

            strapi.log.info(`[StoreController] スーパー管理者店舗作成: category=${category} documentId=${createdStore.documentId}`);

            return { data: createdStore };
        } catch (error) {
            strapi.log.error(`[StoreController] スーパー管理者店舗作成エラー: ${error.message}`);
            return ctx.internalServerError('Failed to create store', { error });
        }
    },

    async findOne(ctx) {
        const { data, meta } = await super.findOne(ctx);
        if (data) {
            const attrs = data.attributes || data;
            // Calculate source info
            const config = StoreConfig.resolve(attrs);
            // Attach source to meta or attributes? 
            // Attaching to meta is cleaner for "metadata"
            meta.configSource = (config as any).source;
            // Also attach specific duration sources if needed
        }
        return { data, meta };
    },

    async checkAvailability(ctx) {
        const { id } = ctx.params;
        const { date, time, guests, courseId } = ctx.query;

        if (!date || !time || !guests) {
            return ctx.badRequest('Missing required parameters: date, time, guests');
        }

        try {
            const result = await strapi.service('api::store.store').checkAvailability(
                id,
                date,
                time,
                parseInt(String(guests), 10),
                courseId || null  // コースIDをサービスに渡す
            );

            return result;
        } catch (error) {
            console.error('Error in checkAvailability controller:', error);
            ctx.throw(500, error);
        }
    },

    /**
     * GET /api/stores/:id/available-slots
     * フロントエンドで計算していたスロット生成をバックエンドに集約
     * @query date - 対象日付 "YYYY-MM-DD"
     * @query guests - ゲスト人数
     * @returns AvailableSlot[]
     */
    async getAvailableSlots(ctx) {
        const { id } = ctx.params;
        const { date, guests } = ctx.query;

        if (!date) {
            return ctx.badRequest('Missing required parameter: date');
        }

        const guestsNum = parseInt(String(guests || '2'), 10);

        try {
            // 店舗情報を取得（documentIdでの検索に対応）
            let store = await strapi.entityService.findOne('api::store.store', id, {
                populate: '*'
            });

            // Strapi v5: documentIdでの検索フォールバック
            if (!store) {
                store = await strapi.db.query('api::store.store').findOne({
                    where: { documentId: id },
                    populate: true
                });
            }

            if (!store) {
                return ctx.notFound('Store not found');
            }

            const config = StoreConfig.resolve(store, date as string);

            // スロット生成（バックエンドで集約）
            // 注: config.slots は customDailyHours による上書き適用済み
            const timeSlots = StoreDomain.generateTimeSlots(config, date as string, store);

            // 休業日の場合は空配列を返す
            if (timeSlots.length === 0) {
                return {
                    date,
                    guests: guestsNum,
                    isClosed: true,
                    slots: []
                };
            }

            // 各スロットの空き状況をチェック
            const storeService = strapi.service('api::store.store');
            const slots: AvailableSlot[] = await Promise.all(
                timeSlots.map(async (time: string) => {
                    // Ticket-09: 該当するスロットを判定
                    const applicableSlot = StoreDomain.getApplicableSlot(time, config);

                    const result = await (storeService as any).checkAvailability(
                        id,
                        date,
                        time,
                        guestsNum
                    );

                    // ステータス決定
                    let status: 'AVAILABLE' | 'FULL' | 'CLOSED' | 'LIMITED' = 'AVAILABLE';
                    if (!result.available) {
                        status = 'FULL';
                    } else if (result.capacityUsed >= 50) {
                        status = 'LIMITED';
                    }

                    return {
                        time,
                        status,
                        capacityUsed: result.capacityUsed || 0,
                        action: result.action || (result.available ? 'proceed' : 'reject'),
                        reason: result.reason || '',
                        slotId: applicableSlot?.id,
                        slotLabel: applicableSlot?.label,
                    };
                })
            );

            return {
                date,
                guests: guestsNum,
                isClosed: false,
                slots
            };

        } catch (error) {
            console.error('Error in getAvailableSlots controller:', error);
            ctx.throw(500, error);
        }
    },

}));
