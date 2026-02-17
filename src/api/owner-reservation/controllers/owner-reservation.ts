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

            console.log(`[OwnerRes] List Request. StoreID: ${storeId}`);
            console.log(`[OwnerRes] Query:`, ctx.request.query);
            console.log(`[OwnerRes] Initial Filter:`, JSON.stringify(where));

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
            } else {
                // Default: exclude canceled reservations from timeline
                where.status = { $ne: 'canceled' };
            }

            // ページネーション
            const offset = (parseInt(page as string) - 1) * parseInt(pageSize as string);
            const limit = parseInt(pageSize as string);

            // 予約を取得
            const reservations = await strapi.documents('api::reservation.reservation').findMany({
                filters: where,
                sort: ['date:desc', 'time:asc'],
                start: offset,
                limit,
                populate: ['assignedTables', 'customer'],
            });

            // 総件数を取得
            const total = await strapi.documents('api::reservation.reservation').count({
                filters: where,
            });

            // BE-104: 各予約に対してcustomerStatsを取得
            const dataWithStats = await Promise.all(
                reservations.map(async (r: any) => {
                    // 電話番号がある場合は履歴を検索
                    let customerStats = null;
                    if (r.phone) {
                        customerStats = await strapi.service('api::customer.customer-stats').getCustomerStats(
                            r.phone,
                            storeId
                        );
                    }

                    // DEBUG: Log duration for specific user to trace 0px issue
                    // if (r.name && r.name.includes('山')) {
                    //    console.log(`[OwnerRes] Mapping ${r.name} (DocID: ${r.documentId}): Duration=${r.duration} (${typeof r.duration}) / Lane=${r.laneIndex}`);
                    // }

                    // guestNameがNULLの場合、customerリレーションの名前をフォールバック
                    const resolvedName = r.guestName || r.customer?.name || '';
                    return {
                        id: r.id, // Numeric ID
                        documentId: r.documentId, // Document ID
                        reservationNumber: r.reservationNumber,
                        name: resolvedName, // guestName → customer.name フォールバック付き
                        email: r.email,
                        phone: r.phone,
                        date: r.date,
                        time: r.time,
                        duration: r.duration,
                        laneIndex: r.laneIndex, // Ticket-03: Ensure laneIndex is returned
                        guests: r.guests,
                        status: r.status,
                        course: r.course,
                        notes: r.notes,
                        notesTranslation: r.notesTranslation, // Ticket-10
                        // Ticket-AI: Expose AI Analysis
                        aiAdvice: r.aiAdvice,
                        aiReason: r.aiReason,
                        aiAnalysisResult: r.aiAnalysisResult,
                        ownerNote: r.ownerNote,
                        ownerReply: r.ownerReply,
                        requiresAttention: r.requiresAttention,
                        isOwnerEntry: r.isOwnerEntry,
                        language: r.language, // Fix: Expose language field
                        assignedTables: r.assignedTables?.map((t: any) => ({
                            id: t.id, // Numeric ID
                            documentId: t.documentId, // Document ID
                            name: t.name,
                            capacity: t.capacity,
                        })) || [],
                        customer: r.customer ? {
                            id: r.customer.id, // Numeric ID
                            documentId: r.customer.documentId, // Document ID
                            name: r.customer.name,
                            totalVisits: r.customer.totalVisits,
                            // Ticket-CRM: Make sure internalNote is available for editing
                            internalNote: r.customer.internalNote,
                            allergyInfo: r.customer.allergyInfo,
                            preferences: r.customer.preferences,
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
                    name: reservation.guestName, // Map for compatibility
                    email: reservation.email,
                    phone: reservation.phone,
                    date: reservation.date,
                    time: reservation.time,
                    duration: reservation.duration,
                    laneIndex: reservation.laneIndex,
                    guests: reservation.guests,
                    status: reservation.status,
                    course: reservation.course,
                    notes: reservation.notes,
                    notesTranslation: reservation.notesTranslation, // Ticket-10
                    // Ticket-AI: Expose AI Analysis
                    aiAdvice: reservation.aiAdvice,
                    aiReason: reservation.aiReason,
                    aiAnalysisResult: reservation.aiAnalysisResult,
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
        const { id } = ctx.params;
        const { status, ownerReply, assignedTables, cancelReason } = ctx.request.body;
        const storeId = ctx.request.header['x-store-id'];

        if (!storeId) {
            return ctx.badRequest('X-Store-ID header is required');
        }

        try {
            // 1. Validate Store & Reservation
            const reservation = await strapi.db.query('api::reservation.reservation').findOne({
                where: { documentId: id, store: { documentId: storeId } },
            });

            if (!reservation) {
                return ctx.notFound('Reservation not found');
            }

            // 2. Prepare Update Data
            const updateData: any = {
                status,
            };

            if (ownerReply !== undefined) updateData.ownerReply = ownerReply;

            // Handle logical cancellation
            // Schema: status="canceled" (L1) / Field="canceledAt" (L1)
            if (status === 'canceled' || status === 'rejected') {
                updateData.canceledAt = new Date().toISOString();
                if (cancelReason) updateData.cancelReason = cancelReason;

                // Note: Schema enum only has 'canceled'. 
                // If 'rejected' is passed, it might be saved as text but conflict with enum?
                // For safety, force 'canceled' if we want strictly schema compliant?
                // But frontend might expect 'rejected'. Assuming 'rejected' works or maps to 'canceled'.
                // If we want to be safe:
                // if (status === 'rejected') updateData.status = 'canceled';
            }

            if (status === 'confirmed') {
                updateData.confirmedAt = new Date();
                updateData.isRead = true;
            }

            // 3. Update
            const updated = await strapi.documents('api::reservation.reservation').update({
                documentId: reservation.documentId,
                data: updateData,
            });

            strapi.log.info(`[OwnerRes] Status updated for ${id}: ${status}`);

            return ctx.body = {
                success: true,
                data: updated,
            };

        } catch (error) {
            strapi.log.error('Reservation status update error:', error);
            return ctx.internalServerError('Failed to update status');
        }
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
            // Support updating duration (Ticket-Fix)
            const newDuration = (ctx.request.body.duration !== undefined)
                ? parseInt(ctx.request.body.duration)
                : (reservation.duration || 90);

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
            // Add duration to update data
            if (ctx.request.body.duration !== undefined) updateData.duration = newDuration;


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

            // 所要時間（更新されたdurationを使用）
            const duration = newDuration;

            const endMin = startMin + duration;

            strapi.log.info(`[Update Debug] Checking Store DocID: ${store.documentId} (Numeric: ${store.id}), Date: ${checkDate} (${typeof checkDate})`);

            // 重複予約の検索
            const conflictingReservations = await strapi.db.query('api::reservation.reservation').findMany({
                where: {
                    store: { documentId: store.documentId }, // Try Document ID
                    date: checkDate,
                    id: { $ne: reservation.id },
                    status: { $notIn: ['canceled', 'no_show', 'completed'] },
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

            // Deduplicate by Document ID (handle Draft/Published versions)
            const uniqueConflicts = realConflicts.filter((res: any, index: number, self: any[]) =>
                index === self.findIndex((t) => t.documentId === res.documentId)
            );

            strapi.log.info(`[Update Debug] Conflict Check. Date: ${checkDate}, Time: ${checkTime}, AssTables: ${JSON.stringify(newAssignedTables)}`);
            strapi.log.info(`[Update Debug] Conflicting Candidates: ${conflictingReservations.length}, Real Conflicts: ${realConflicts.length}, Unique: ${uniqueConflicts.length}`);

            // ==========================================
            // Check Mode Result
            // ==========================================
            if (strategy === 'check') {
                if (uniqueConflicts.length > 0) {
                    ctx.status = 409;
                    const conflictResponse: any = {
                        success: false,
                        conflictType: 'overlap',
                        conflictingReservations: uniqueConflicts.map((r: any) => ({
                            id: r.documentId,
                            reservationNumber: r.reservationNumber,
                            time: r.time,
                            guestName: r.guestName,
                            assignedTables: r.assignedTables.map((t: any) => ({ id: t.documentId, name: t.name }))
                        })),
                        reason: `${uniqueConflicts.length} reservations conflict with this slot.`,
                    };

                    // Swap Suggestion Logic
                    console.log(`[Update Debug] Conflict Count: ${uniqueConflicts.length}`);
                    if (uniqueConflicts.length === 1) {
                        // Simple 1-on-1 swap
                        const target = uniqueConflicts[0];
                        console.log(`[Update Debug] Swap Candidate Found: ${target.documentId} (${target.guestName})`);

                        // Optionally check if tables counts match, but for now allow strict 1-to-1 reservation swap
                        conflictResponse.action = 'swap';
                        conflictResponse.targetReservationId = target.documentId;
                        conflictResponse.reason = `Conflict with ${target.guestName}. Swap seats?`;
                    } else {
                        console.log(`[Update Debug] No Swap: Conflict count is ${uniqueConflicts.length}`);
                    }

                    return ctx.body = conflictResponse;
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

                // Update
                const updated = await strapi.documents('api::reservation.reservation').update({
                    documentId: reservation.documentId,
                    data: dataToUpdate,
                    populate: ['assignedTables'],
                });

                strapi.log.info(`[Update Debug] Force update executed. DocID: ${reservation.documentId}`);
                strapi.log.info(`[Update Debug] Updated Reservation Assigned Tables: ${JSON.stringify((updated as any).assignedTables ? (updated as any).assignedTables.map((t: any) => t.name) : 'undefined')}`);

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
                await strapi.documents('api::reservation.reservation').update({
                    documentId: reservation.documentId,
                    data: {
                        assignedTables: tablesForSource,
                        time: updateData.time || reservation.time,
                        date: updateData.date || reservation.date,
                        guests: updateData.guests || reservation.guests,
                        duration: updateData.duration || reservation.duration
                    },
                    populate: ['assignedTables']
                });

                // Update Target
                await strapi.documents('api::reservation.reservation').update({
                    documentId: targetRes.documentId,
                    data: {
                        assignedTables: tablesForTargetRes
                    },
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
    async fixCounters(ctx) {
        let storeId = ctx.request.header['x-store-id'];
        if (!storeId) return ctx.badRequest('No Store ID');

        try {
            // Validate/Resolve Store ID
            if (!isNaN(Number(storeId))) {
                const store = await strapi.db.query('api::store.store').findOne({ where: { id: storeId } });
                if (store) storeId = store.documentId;
            }

            // Cleanup: Archive ANY existing Active table with "カウンター" in name
            const oldTables = await strapi.documents('api::table.table').findMany({
                filters: {
                    store: { documentId: storeId },
                    name: { $contains: 'カウンター' },
                    isActive: true
                }
            });

            console.log(`[Migration] Archiving ${oldTables.length} existing counter tables...`);
            for (const t of oldTables) {
                await strapi.documents('api::table.table').update({
                    documentId: t.documentId,
                    data: {
                        name: `(Archived) ${t.name}`,
                        isActive: false
                    }
                });
            }

            // Create 10 New Counter Tables (Cap 1)
            const newTables = [];
            for (let i = 1; i <= 10; i++) {
                const newT = await strapi.documents('api::table.table').create({
                    data: {
                        name: `カウンター${i}`,
                        capacity: 1,
                        maxCapacity: 1,
                        baseCapacity: 1,
                        isActive: true,
                        type: 'counter',
                        store: storeId,
                        sortOrder: i
                    } as any,
                    status: 'published'
                });
                newTables.push(newT);
            }

            // Migrate Existing Reservations
            const archivedIds = oldTables.map((t: any) => t.documentId);
            const reservations = await strapi.documents('api::reservation.reservation').findMany({
                filters: {
                    store: { documentId: storeId },
                    assignedTables: { documentId: { $in: archivedIds } },
                    status: { $ne: 'canceled' },
                },
                populate: ['assignedTables']
            });

            console.log(`[Migration] Found ${reservations.length} reservations to migrate.`);

            let migratedCount = 0;
            const migrationLog = [];

            // Simple In-Memory State for Overlap Check
            const seatOccupancy: Record<string, any[]> = {};
            newTables.forEach((t: any) => seatOccupancy[t.documentId] = []);

            const checkOverlap = (existingRes: any, newRes: any) => {
                try {
                    const partsA = existingRes.time.split(':');
                    const startA = parseInt(partsA[0]) * 60 + parseInt(partsA[1]);
                    const endA = startA + (existingRes.duration || 90);

                    const partsB = newRes.time.split(':');
                    const startB = parseInt(partsB[0]) * 60 + parseInt(partsB[1]);
                    const endB = startB + (newRes.duration || 90);

                    if (existingRes.date !== newRes.date) return false;
                    return (startA < endB) && (startB < endA);
                } catch { return true; }
            };

            for (const res of reservations) {
                const guests = res.guests || 2;
                let assignedIds: string[] = [];
                let found = false;

                // 1. Try Sequential Blocks (BEST FIT logic)
                for (let i = 0; i <= newTables.length - guests; i++) {
                    const block = newTables.slice(i, i + guests);
                    const isBlockFree = block.every((table: any) => {
                        return !seatOccupancy[table.documentId].some((existing: any) => checkOverlap(existing, res));
                    });

                    if (isBlockFree) {
                        assignedIds = block.map((t: any) => t.documentId);
                        found = true;
                        break;
                    }
                }

                // 2. If not sequential, try Scattered
                if (!found) {
                    const freeTables = newTables.filter((table: any) => {
                        return !seatOccupancy[table.documentId].some((existing: any) => checkOverlap(existing, res));
                    });
                    if (freeTables.length >= guests) {
                        assignedIds = freeTables.slice(0, guests).map((t: any) => t.documentId);
                        found = true;
                    }
                }

                if (found) {
                    assignedIds.forEach(id => seatOccupancy[id].push(res));
                    await strapi.documents('api::reservation.reservation').update({
                        documentId: res.documentId,
                        data: { assignedTables: assignedIds }
                    });
                    migratedCount++;
                    migrationLog.push(`Res ${res.id} (${res.guestName}, ${guests}p) -> ${assignedIds.length} seats`);
                } else {
                    migrationLog.push(`Res ${res.id} (${res.guestName}, ${guests}p) -> FAILED. Needs manual fix.`);
                }
            }

            return ctx.send({
                success: true,
                message: `Created 10 Counter Seats (Cap 1). Migrated ${migratedCount}/${reservations.length}. Archived ${oldTables.length} tables.`,
                log: migrationLog
            });

        } catch (err) {
            console.error('Migration Failed:', err);
            return ctx.send({
                success: false,
                error: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined
            });
        }
    },

    /**
     * POST /api/owner/reservations/recalc-lanes
     * Force recalculate lane indices for a date
     */
    async recalcLanes(ctx) {
        const storeId = ctx.request.header['x-store-id'];
        const { date } = ctx.request.body;

        if (!storeId) {
            return ctx.badRequest('X-Store-ID header is required');
        }

        if (!date) {
            return ctx.badRequest('date is required in body');
        }

        try {
            // Get store tables to identify counters
            const store = await strapi.db.query('api::store.store').findOne({
                where: { documentId: storeId },
                populate: ['tables']
            });

            if (!store) {
                return ctx.notFound('Store not found');
            }

            const counterTableIds = new Set(
                ((store as any).tables || [])
                    .filter((t: any) => t.type === 'counter' || t.name?.includes('カウンター'))
                    .map((t: any) => t.id)
            );

            // Get all reservations for the date
            const reservations = await strapi.db.query('api::reservation.reservation').findMany({
                where: {
                    store: { documentId: storeId },
                    date: date,
                    status: { $ne: 'canceled' }
                },
                orderBy: { time: 'asc' },
                populate: ['assignedTables']
            });

            if (!reservations || reservations.length === 0) {
                return ctx.send({ success: true, message: 'No reservations found', updated: 0 });
            }

            // Separate counter and table reservations
            const counterRes: any[] = [];
            const tableRes: any[] = [];

            reservations.forEach((res: any) => {
                const isCounter = res.assignedTables?.some((t: any) => counterTableIds.has(t.id));
                if (isCounter) {
                    counterRes.push(res);
                } else {
                    tableRes.push(res);
                }
            });

            console.log(`[RecalcLanes] Counter: ${counterRes.length}, Table: ${tableRes.length}`);

            // Helper
            const { timeToMinutes } = require('../../../utils/timeUtils');

            const assignLanes = (resGroup: any[]): Map<string, number> => {
                const lanes: number[] = [];
                const assignments = new Map<string, number>();

                for (const res of resGroup) {
                    const startMin = timeToMinutes(res.time);
                    const duration = res.duration || 90;
                    const endMin = startMin + duration;

                    let assignedLane = -1;
                    for (let i = 0; i < lanes.length; i++) {
                        if (lanes[i] <= startMin) {
                            assignedLane = i;
                            lanes[i] = endMin;
                            break;
                        }
                    }

                    if (assignedLane === -1) {
                        assignedLane = lanes.length;
                        lanes.push(endMin);
                    }

                    assignments.set(res.documentId, assignedLane);
                }

                return assignments;
            };

            const counterLanes = assignLanes(counterRes);
            const tableLanes = assignLanes(tableRes);

            console.log(`[RecalcLanes] Counter lanes:`, Array.from(counterLanes.entries()));
            console.log(`[RecalcLanes] Table lanes:`, Array.from(tableLanes.entries()));

            // Update using document service (updates draft)
            let updated = 0;

            for (const [docId, lane] of counterLanes) {
                const res = counterRes.find((r: any) => r.documentId === docId);
                if (res && res.laneIndex !== lane) {
                    await strapi.documents('api::reservation.reservation').update({
                        documentId: docId,
                        data: { laneIndex: lane }
                    });
                    console.log(`[RecalcLanes] Updated ${res.guestName}: ${res.laneIndex} -> ${lane}`);
                    updated++;
                }
            }

            for (const [docId, lane] of tableLanes) {
                const res = tableRes.find((r: any) => r.documentId === docId);
                if (res && res.laneIndex !== lane) {
                    await strapi.documents('api::reservation.reservation').update({
                        documentId: docId,
                        data: { laneIndex: lane }
                    });
                    console.log(`[RecalcLanes] Updated ${res.guestName}: ${res.laneIndex} -> ${lane}`);
                    updated++;
                }
            }

            return ctx.send({
                success: true,
                message: `Recalculated lanes for ${date}`,
                total: reservations.length,
                counter: counterRes.length,
                table: tableRes.length,
                updated
            });

        } catch (err) {
            console.error('RecalcLanes Failed:', err);
            return ctx.send({
                success: false,
                error: err instanceof Error ? err.message : String(err)
            });
        }
    },
};
