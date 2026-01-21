import { factories } from '@strapi/strapi';
import { StoreConfig } from '../../../core/config/StoreConfig';
import { StoreDomain, AvailableSlot } from '../../../core/domain/StoreDomain';

export default factories.createCoreController('api::store.store', ({ strapi }) => ({
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
        const { date, time, guests } = ctx.query;

        if (!date || !time || !guests) {
            return ctx.badRequest('Missing required parameters: date, time, guests');
        }

        try {
            const result = await strapi.service('api::store.store').checkAvailability(
                id,
                date,
                time,
                parseInt(String(guests), 10)
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
            // 店舗情報を取得
            const store = await strapi.entityService.findOne('api::store.store', id, {
                populate: '*'
            });

            if (!store) {
                return ctx.notFound('Store not found');
            }

            const config = StoreConfig.resolve(store);

            // スロット生成（バックエンドで集約）
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
                        reason: result.reason || ''
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
