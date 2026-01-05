/**
 * 店主予約管理コントローラー
 * BE-102 実装
 */

export default {
    /**
     * GET /api/owner/reservations
     * 予約一覧取得（フィルタ対応）
     */
    async list(ctx) {
        const storeId = ctx.request.header['x-store-id'];
        const { date, status, startDate, endDate, page = 1, pageSize = 20 } = ctx.request.query;

        if (!storeId) {
            return ctx.badRequest('X-Store-ID header is required');
        }

        try {
            const where: any = {
                store: { documentId: storeId },
            };

            // 日付フィルタ
            if (date) {
                where.date = date;
            } else if (startDate && endDate) {
                where.date = {
                    $gte: startDate,
                    $lte: endDate,
                };
            } else if (startDate) {
                where.date = { $gte: startDate };
            } else if (endDate) {
                where.date = { $lte: endDate };
            }

            // ステータスフィルタ
            if (status) {
                if (status.includes(',')) {
                    where.status = { $in: status.split(',') };
                } else {
                    where.status = status;
                }
            }

            // ページネーション
            const offset = (parseInt(page as string) - 1) * parseInt(pageSize as string);
            const limit = parseInt(pageSize as string);

            // 予約を取得
            const reservations = await strapi.db.query('api::reservation.reservation').findMany({
                where,
                orderBy: [{ date: 'asc' }, { time: 'asc' }],
                offset,
                limit,
                populate: ['assignedTables', 'customer'],
            });

            // 総件数を取得
            const total = await strapi.db.query('api::reservation.reservation').count({ where });

            // BE-104: 各予約に対してcustomerStatsを取得
            const dataWithStats = await Promise.all(
                reservations.map(async (r) => {
                    // 電話番号がある場合は履歴を検索
                    let customerStats = null;
                    if (r.phone) {
                        customerStats = await strapi.service('api::customer.customer-stats').getCustomerStats(
                            r.phone,
                            storeId
                        );
                    }

                    return {
                        id: r.documentId,
                        reservationNumber: r.reservationNumber,
                        guestName: r.guestName,
                        email: r.email,
                        phone: r.phone,
                        date: r.date,
                        time: r.time,
                        duration: r.duration,
                        guests: r.guests,
                        status: r.status,
                        course: r.course,
                        notes: r.notes,
                        ownerNote: r.ownerNote,
                        ownerReply: r.ownerReply,
                        requiresAttention: r.requiresAttention,
                        isOwnerEntry: r.isOwnerEntry,
                        assignedTables: r.assignedTables?.map((t: any) => ({
                            id: t.documentId,
                            name: t.name,
                            capacity: t.capacity,
                        })) || [],
                        customer: r.customer ? {
                            id: r.customer.documentId,
                            name: r.customer.name,
                            totalVisits: r.customer.totalVisits,
                        } : null,
                        customerStats,
                        createdAt: r.createdAt,
                        updatedAt: r.updatedAt,
                    };
                })
            );

            ctx.body = {
                success: true,
                data: dataWithStats,
                meta: {
                    page: parseInt(page as string),
                    pageSize: parseInt(pageSize as string),
                    total,
                    pageCount: Math.ceil(total / parseInt(pageSize as string)),
                },
            };
        } catch (error) {
            strapi.log.error('Reservation list error:', error);
            ctx.internalServerError('Failed to get reservations');
        }
    },

    /**
     * GET /api/owner/reservations/:id
     * 予約詳細取得
     */
    async findOne(ctx) {
        const { id } = ctx.params;
        const storeId = ctx.request.header['x-store-id'];

        if (!storeId) {
            return ctx.badRequest('X-Store-ID header is required');
        }

        try {
            const reservation = await strapi.db.query('api::reservation.reservation').findOne({
                where: { documentId: id, store: { documentId: storeId } },
                populate: ['assignedTables', 'customer', 'store'],
            });

            if (!reservation) {
                return ctx.notFound('Reservation not found');
            }

            ctx.body = {
                success: true,
                data: {
                    id: reservation.documentId,
                    reservationNumber: reservation.reservationNumber,
                    guestName: reservation.guestName,
                    email: reservation.email,
                    phone: reservation.phone,
                    date: reservation.date,
                    time: reservation.time,
                    duration: reservation.duration,
                    guests: reservation.guests,
                    status: reservation.status,
                    course: reservation.course,
                    notes: reservation.notes,
                    ownerNote: reservation.ownerNote,
                    ownerReply: reservation.ownerReply,
                    requiresAttention: reservation.requiresAttention,
                    isOwnerEntry: reservation.isOwnerEntry,
                    language: reservation.language,
                    assignedTables: reservation.assignedTables?.map((t: any) => ({
                        id: t.documentId,
                        name: t.name,
                        capacity: t.capacity,
                    })) || [],
                    customer: reservation.customer ? {
                        id: reservation.customer.documentId,
                        name: reservation.customer.name,
                        email: reservation.customer.email,
                        phone: reservation.customer.phone,
                        totalVisits: reservation.customer.totalVisits,
                        lastVisitDate: reservation.customer.lastVisitDate,
                    } : null,
                    createdAt: reservation.createdAt,
                    updatedAt: reservation.updatedAt,
                },
            };
        } catch (error) {
            strapi.log.error('Reservation findOne error:', error);
            ctx.internalServerError('Failed to get reservation');
        }
    },

    /**
     * PUT /api/owner/reservations/:id/status
     * ステータス更新（メール送信トリガー）
     */
    async updateStatus(ctx) {
        // ... (unchanged code) ...
        const { id } = ctx.params;
        const { status, ownerReply, assignedTables } = ctx.request.body;
        // ... (rest of updateStatus implementation)
    },

    /**
     * PUT /api/owner/reservations/:id
     * 予約更新（時間・座席変更、コンフリクト制御）
     * Ticket-01 実装
     */
    async update(ctx) {
        const { id } = ctx.params;
        const { time, guests, assignedTables, strategy = 'check', targetReservationId } = ctx.request.body;
        const storeId = ctx.request.header['x-store-id'];

        if (!storeId) {
            return ctx.badRequest('X-Store-ID header is required');
        }

        try {
            // 1. 対象予約の取得
            const reservation = await strapi.db.query('api::reservation.reservation').findOne({
                where: { documentId: id, store: { documentId: storeId } },
                populate: ['assignedTables', 'store'],
            });

            if (!reservation) {
                return ctx.notFound('Reservation not found');
            }

            const store = reservation.store;
            const newTime = time || reservation.time;
            const newGuests = guests || reservation.guests;
            let newAssignedTables = [];

            // テーブルID解決
            if (assignedTables && Array.isArray(assignedTables)) {
                // assignedTablesが送信された場合
                const tables = await strapi.db.query('api::table.table').findMany({
                    where: { documentId: { $in: assignedTables } },
                });
                newAssignedTables = tables.map((t: any) => t.id);

                strapi.log.info(`[Update Debug] Input assignedTables (DocIDs): ${JSON.stringify(assignedTables)}`);
                strapi.log.info(`[Update Debug] Resolved tables count: ${tables.length}`);
                strapi.log.info(`[Update Debug] New Assigned Tables (Numeric IDs): ${JSON.stringify(newAssignedTables)}`);
            } else {
                // 送信されない場合は既存維持
                newAssignedTables = reservation.assignedTables.map((t: any) => t.id);
                strapi.log.info(`[Update Debug] No assignedTables in payload. Keeping existing: ${JSON.stringify(newAssignedTables)}`);
            }

            // 2. 基本更新データ
            const updateData: any = {};
            if (time) updateData.time = time;
            if (guests) updateData.guests = guests;
            if (assignedTables) updateData.assignedTables = newAssignedTables;


            // ==========================================
            // Force Mode: 無条件更新
            // ==========================================
            if (strategy === 'force') {
                const updated = await strapi.db.query('api::reservation.reservation').update({
                    where: { id: reservation.id },
                    data: updateData,
                    populate: ['assignedTables'],
                });
                return ctx.body = { success: true, data: updated, message: 'Forced update successful' };
            }


            // ==========================================
            // Check Mode (Default) & Swap Pre-calculation
            // ==========================================

            // コンフリクトチェックロジック
            // store.checkAvailability は「新規予約」向けで、自分自身を除外できないため、
            // ここで簡易的な衝突判定を行うか、既存サービスを拡張する必要がある。
            // ここでは簡易実装として、指定されたテーブル・時間帯での重複を直接クエリする。

            // 時間帯の計算
            // 日付と時間の決定（更新データがあればそちらを優先）
            const checkDate = updateData.date || reservation.date;
            const checkTime = updateData.time || reservation.time;

            // 時間帯の計算
            const { timeToMinutes } = require('../../../utils/timeUtils');
            const startMin = timeToMinutes(checkTime);

            // 所要時間（簡易計算またはストア設定から）
            const storeAny = store as any;
            const isLunch = startMin < 15 * 60; // 簡易判定
            const duration = isLunch
                ? (storeAny.lunchDuration || 90)
                : (storeAny.dinnerDuration || 120);

            const endMin = startMin + duration;

            strapi.log.info(`[Update Debug] Checking Store DocID: ${store.documentId} (Numeric: ${store.id}), Date: ${checkDate} (${typeof checkDate})`);

            // 重複予約の検索
            const conflictingReservations = await strapi.db.query('api::reservation.reservation').findMany({
                where: {
                    store: { documentId: store.documentId }, // Try Document ID
                    date: checkDate,
                    id: { $ne: reservation.id },
                    status: { $notIn: ['cancelled', 'no_show', 'completed'] },
                    assignedTables: {
                        id: { $in: newAssignedTables }
                    }
                },
                populate: ['assignedTables']
            });

            // JSで厳密な時間重複チェック
            const realConflicts = conflictingReservations.filter((res: any) => {
                const resStart = timeToMinutes(res.time);
                // 相手のDuration（保存されていなければデフォルト）
                const resDuration = res.duration || duration;
                const resEnd = resStart + resDuration;

                return (startMin < resEnd) && (resStart < endMin);
            });

            strapi.log.info(`[Update Debug] Conflict Check. Date: ${checkDate}, Time: ${checkTime}, AssTables: ${JSON.stringify(newAssignedTables)}`);
            strapi.log.info(`[Update Debug] Conflicting Candidates: ${conflictingReservations.length}, Real Conflicts: ${realConflicts.length}`);

            // ==========================================
            // Check Mode Result
            // ==========================================
            if (strategy === 'check') {
                if (realConflicts.length > 0) {
                    ctx.status = 409;
                    return ctx.body = {
                        success: false,
                        conflictType: 'overlap',
                        conflictingReservations: realConflicts.map((r: any) => ({
                            id: r.documentId,
                            reservationNumber: r.reservationNumber,
                            time: r.time,
                            guestName: r.guestName,
                            assignedTables: r.assignedTables.map((t: any) => ({ id: t.documentId, name: t.name }))
                        }))
                    };
                }

                // コンフリクトなし -> 更新実行
                const updated = await strapi.db.query('api::reservation.reservation').update({
                    where: { id: reservation.id },
                    data: updateData,
                    populate: ['assignedTables'],
                });

                strapi.log.info(`[Update Debug] Update executed. Success: true`);
                strapi.log.info(`[Update Debug] Updated Reservation Assigned Tables: ${JSON.stringify(updated.assignedTables ? updated.assignedTables.map((t: any) => t.name) : 'undefined')}`);

                return ctx.body = { success: true, data: updated };
            }

            // ==========================================
            // Force Mode
            // ==========================================
            if (strategy === 'force') {
                // Remove id from updateData as update() uses documentId
                const { id, ...dataToUpdate } = updateData;

                const updated = await strapi.documents('api::reservation.reservation').update({
                    documentId: reservation.documentId,
                    data: dataToUpdate,
                    status: 'published', // Force Publish to update Live data
                    populate: ['assignedTables'],
                });

                strapi.log.info(`[Update Debug] Force update executed. DocID: ${reservation.documentId}`);
                strapi.log.info(`[Update Debug] Updated Reservation Assigned Tables: ${JSON.stringify(updated.assignedTables ? updated.assignedTables.map((t: any) => t.name) : 'undefined')}`);

                return ctx.body = { success: true, data: updated };
            }

            // ==========================================
            // Swap Mode
            // ==========================================
            if (strategy === 'swap') {
                const targetReservationId = ctx.request.body.targetReservationId;
                if (!targetReservationId) {
                    return ctx.badRequest('Target reservation ID required for swap');
                }

                // 相手側の予約取得
                const targetRes = await strapi.documents('api::reservation.reservation').findOne({
                    documentId: targetReservationId,
                    populate: ['assignedTables']
                });

                if (!targetRes) {
                    return ctx.notFound('Target reservation not found');
                }

                strapi.log.info(`[Update Debug] Starting Swap. Source: ${reservation.documentId}, Target: ${targetRes.documentId}`);

                // テーブルの交換
                const tablesForA = targetRes.assignedTables.map((t: any) => t.documentId); // Use DocumentId

                // tablesForB logic:
                // If Frontend sends newAssignedTables (DocIDs) for "Force", it usually sends the tables it DRAGGED TO.
                // In Swap, the "Drag Destination" IS the Target's table.

                // Wait. validation at top checks `updatedData.assignedTables`.
                // If user dragged to Target Table, `newAssignedTables` IS Target Table.
                // So tablesForSource = newAssignedTables (Target Table).
                // tablesForTarget = Source's Old Table.

                const tablesForSource = newAssignedTables;
                const tablesForTargetRes = reservation.assignedTables.map((t: any) => t.documentId);

                // Update Source
                const updatedSource = await strapi.documents('api::reservation.reservation').update({
                    documentId: reservation.documentId,
                    data: {
                        assignedTables: tablesForSource,
                        time: updateData.time || reservation.time,
                        date: updateData.date || reservation.date
                    },
                    status: 'published', // Force Publish
                    populate: ['assignedTables']
                });

                // Update Target
                const updatedTarget = await strapi.documents('api::reservation.reservation').update({
                    documentId: targetRes.documentId,
                    data: {
                        assignedTables: tablesForTargetRes
                    },
                    status: 'published', // Force Publish
                });

                strapi.log.info(`[Update Debug] Swapped. Source(${reservation.documentId})->${JSON.stringify(tablesForSource)}, Target(${targetRes.documentId})->${JSON.stringify(tablesForTargetRes)}`);

                return ctx.body = { success: true, message: 'Swapped successfully' };
            }

            return ctx.badRequest('Invalid strategy');

        } catch (error) {
            strapi.log.error('Reservation update error:', error);
            // トランザクションエラーの場合はここで捕捉される
            return ctx.internalServerError('Failed to update reservation: ' + String(error));
        }
    },

    /**
     * POST /api/owner/reservations/:id/checkout
     * 早期退店（Checkout）
     * Ticket-02 実装
     */
    async checkout(ctx) {
        const { id } = ctx.params;
        const storeId = ctx.request.header['x-store-id'];

        if (!storeId) {
            return ctx.badRequest('X-Store-ID header is required');
        }

        try {
            // 1. 予約取得
            const reservation = await strapi.db.query('api::reservation.reservation').findOne({
                where: { documentId: id, store: { documentId: storeId } },
            });

            if (!reservation) {
                return ctx.notFound('Reservation not found');
            }

            if (reservation.status === 'completed' || reservation.status === 'cancelled') {
                return ctx.badRequest(`Reservation is already ${reservation.status}`);
            }

            // 2. 所要時間計算 (現在時刻 - 開始時刻)
            // 日付と時間を結合してDateオブジェクトを作成
            const startDateTimeStr = `${reservation.date}T${reservation.time}`; // YYYY-MM-DDTHH:mm format
            const startLimit = new Date(startDateTimeStr);
            const now = new Date();

            let diffMs = now.getTime() - startLimit.getTime();

            // 日付をまたぐ場合やタイムゾーンの考慮
            // 基本的にサーバーのローカルタイム同士の比較となる。
            // もし予約日が「明日」など未来の場合、diffはマイナスになる。
            // もし予約日が「昨日」で現在も営業中の場合（深夜営業など）、diffは大きくなる。

            let newDuration = Math.floor(diffMs / 1000 / 60); // 分単位

            // 最小値ガード (誤操作や未来の予約の場合)
            if (newDuration < 15) {
                newDuration = 15; // 最低15分とする
            }

            // 3. 更新実行
            const updated = await strapi.db.query('api::reservation.reservation').update({
                where: { id: reservation.id },
                data: {
                    status: 'completed',
                    duration: newDuration,
                    // actualEndTime: now // 必要であればスキーマ追加後に有効化
                }
            });

            return ctx.body = {
                success: true,
                data: updated,
                message: `Checked out successfully. Duration updated to ${newDuration} min.`
            };

        } catch (error) {
            strapi.log.error('Checkout error:', error);
            ctx.internalServerError('Failed to checkout');
        }
    },
};
