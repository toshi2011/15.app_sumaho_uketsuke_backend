/**
 * 店主通知コントローラー
 * DSGN-002 API実装
 */

import { factories } from '@strapi/strapi';
import { v4 as uuidv4 } from 'uuid';

export default {
    /**
     * GET /api/owner/notifications/check
     * 新規予約チェック（ポーリング用）
     */
    async check(ctx) {
        const { query } = ctx.request;
        const storeId = ctx.request.header['x-store-id'];
        const sessionId = ctx.request.header['x-session-id'];

        if (!storeId) {
            return ctx.badRequest('X-Store-ID header is required');
        }

        try {
            // セッション情報を取得
            let lastCheckedAt = null;
            if (sessionId) {
                const session = await strapi.db.query('api::owner-session.owner-session').findOne({
                    where: { sessionId, isActive: true },
                });
                if (session) {
                    lastCheckedAt = session.lastCheckedAt;
                }
            }

            // 指定時刻以降の予約、またはセッション開始以降の予約を取得
            const sinceDate = query.since || lastCheckedAt;

            // pending状態の予約を取得
            const whereCondition: any = {
                store: { documentId: storeId },
                status: 'pending',
            };

            // 全pending予約を取得
            const pendingReservations = await strapi.db.query('api::reservation.reservation').findMany({
                where: whereCondition,
                orderBy: { createdAt: 'desc' },
                populate: ['store'],
            });

            // 新規予約（lastCheckedAt以降）をチェック
            let newReservations = pendingReservations;
            if (sinceDate) {
                newReservations = pendingReservations.filter(
                    (r) => new Date(r.createdAt) > new Date(sinceDate)
                );
            }

            // 要確認予約（備考ありかつrequiresAttention）
            const attentionReservations = pendingReservations.filter(
                (r) => r.requiresAttention || (r.notes && r.notes.trim() !== '')
            );

            // 今日・明日の予約カウント
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dayAfterTomorrow = new Date(today);
            dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

            const todayStr = today.toISOString().split('T')[0];
            const tomorrowStr = tomorrow.toISOString().split('T')[0];

            const allReservations = await strapi.db.query('api::reservation.reservation').findMany({
                where: {
                    store: { documentId: storeId },
                    status: { $in: ['pending', 'confirmed'] },
                },
            });

            const todayCount = allReservations.filter((r) => r.date === todayStr).length;
            const tomorrowCount = allReservations.filter((r) => r.date === tomorrowStr).length;

            // セッションのlastCheckedAtを更新
            if (sessionId) {
                await strapi.db.query('api::owner-session.owner-session').update({
                    where: { sessionId },
                    data: { lastCheckedAt: new Date().toISOString() },
                });
            }

            // 最新の予約
            const latestReservation = pendingReservations.length > 0 ? {
                id: pendingReservations[0].documentId,
                reservationNumber: pendingReservations[0].reservationNumber,
                guestName: pendingReservations[0].guestName,
                date: pendingReservations[0].date,
                time: pendingReservations[0].time,
                guests: pendingReservations[0].guests,
                status: pendingReservations[0].status,
                hasNotes: !!(pendingReservations[0].notes && pendingReservations[0].notes.trim() !== ''),
                createdAt: pendingReservations[0].createdAt,
            } : null;

            ctx.body = {
                success: true,
                data: {
                    hasNew: newReservations.length > 0,
                    unreadCount: pendingReservations.length,
                    requiresAttention: attentionReservations.length,
                    latestReservation,
                    summary: {
                        pendingCount: pendingReservations.length,
                        todayCount,
                        tomorrowCount,
                    },
                },
                meta: {
                    checkedAt: new Date().toISOString(),
                    nextPollInterval: 30000,
                },
            };
        } catch (error) {
            strapi.log.error('Notification check error:', error);
            ctx.internalServerError('Failed to check notifications');
        }
    },

    /**
     * POST /api/owner/notifications/mark-read
     * 予約を既読にする
     */
    async markRead(ctx) {
        const { reservationIds, markAll } = ctx.request.body;
        const storeId = ctx.request.header['x-store-id'];

        if (!storeId) {
            return ctx.badRequest('X-Store-ID header is required');
        }

        try {
            let markedCount = 0;

            if (markAll) {
                // 全ての pending 予約を confirmed に変更
                const result = await strapi.db.query('api::reservation.reservation').updateMany({
                    where: {
                        store: { documentId: storeId },
                        status: 'pending',
                    },
                    data: {
                        // 既読フラグを追加するか、statusを変更するかは要検討
                        // ここでは既読として扱うために特に何もしない
                        // 実際の「確定」は別のAPIで行う
                    },
                });
                markedCount = result.count || 0;
            } else if (reservationIds && reservationIds.length > 0) {
                // 指定された予約のみ処理
                for (const id of reservationIds) {
                    await strapi.db.query('api::reservation.reservation').update({
                        where: { documentId: id },
                        data: {},
                    });
                    markedCount++;
                }
            }

            // 残りの未読件数を取得
            const remainingUnread = await strapi.db.query('api::reservation.reservation').count({
                where: {
                    store: { documentId: storeId },
                    status: 'pending',
                },
            });

            ctx.body = {
                success: true,
                data: {
                    markedCount,
                    remainingUnread,
                },
            };
        } catch (error) {
            strapi.log.error('Mark read error:', error);
            ctx.internalServerError('Failed to mark as read');
        }
    },

    /**
     * POST /api/owner/session/start
     * セッション開始
     */
    async sessionStart(ctx) {
        const { deviceId, platform } = ctx.request.body;
        const storeId = ctx.request.header['x-store-id'];

        if (!storeId) {
            return ctx.badRequest('X-Store-ID header is required');
        }

        try {
            const sessionId = uuidv4();
            const startedAt = new Date().toISOString();

            // 既存のアクティブセッションを終了
            await strapi.db.query('api::owner-session.owner-session').updateMany({
                where: {
                    store: { documentId: storeId },
                    isActive: true,
                },
                data: {
                    isActive: false,
                    endedAt: startedAt,
                },
            });

            // 新しいセッションを作成
            const store = await strapi.db.query('api::store.store').findOne({
                where: { documentId: storeId },
            });

            await strapi.db.query('api::owner-session.owner-session').create({
                data: {
                    sessionId,
                    deviceId: deviceId || null,
                    platform: platform || 'pwa',
                    startedAt,
                    lastCheckedAt: null,
                    isActive: true,
                    store: store?.id,
                },
            });

            ctx.body = {
                success: true,
                data: {
                    sessionId,
                    startedAt,
                    lastCheckedAt: null,
                },
            };
        } catch (error) {
            strapi.log.error('Session start error:', error);
            ctx.internalServerError('Failed to start session');
        }
    },

    /**
     * POST /api/owner/session/end
     * セッション終了
     */
    async sessionEnd(ctx) {
        const { sessionId } = ctx.request.body;

        if (!sessionId) {
            return ctx.badRequest('sessionId is required');
        }

        try {
            const endedAt = new Date().toISOString();

            await strapi.db.query('api::owner-session.owner-session').update({
                where: { sessionId },
                data: {
                    isActive: false,
                    endedAt,
                },
            });

            ctx.body = {
                success: true,
                data: {
                    sessionId,
                    endedAt,
                },
            };
        } catch (error) {
            strapi.log.error('Session end error:', error);
            ctx.internalServerError('Failed to end session');
        }
    },
};
