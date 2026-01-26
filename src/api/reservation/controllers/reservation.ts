import { factories } from '@strapi/strapi';
import { StoreConfig } from '../../../core/config/StoreConfig';
import { StoreDomain } from '../../../core/domain/StoreDomain';
import { timeToMinutes, minutesToTime } from '../../../utils/timeUtils'; // Need minutesToTime
import { AiService } from '../../../core/services/ai';

export default factories.createCoreController('api::reservation.reservation', ({ strapi }) => ({
    async create(ctx) {
        const { data } = ctx.request.body;

        // Ticket-AI-03: CRM Advice & Customer Linking
        // Pre-process Customer Creation OUTSIDE of Transaction
        // preventing transaction abort checking logic from blocking fallback
        let linkedCustomerId = null;
        let customerContextText = "";
        let linkedCustomerData = null;

        if (data && data.phone) {
            try {
                // 1. Try to find existing
                const customers = await strapi.db.query('api::customer.customer').findMany({
                    where: { phone: data.phone },
                    populate: ['reservations'],
                    limit: 1
                });
                let customer = customers && customers.length > 0 ? customers[0] : null;

                // 2. If not found, create new
                if (!customer && data.name) {
                    try {
                        strapi.log.info(`[Reservation] Creating new customer for phone: ${data.phone}`);
                        customer = await strapi.entityService.create('api::customer.customer', {
                            data: {
                                phone: data.phone,
                                name: data.name,
                                email: data.email,
                                store: data.store
                            }
                        });
                    } catch (createErr) {
                        strapi.log.warn('[Reservation] Failed to create customer with email, checking if conflict or other error...', createErr);

                        // Retry without email (Fallback)
                        try {
                            customer = await strapi.entityService.create('api::customer.customer', {
                                data: {
                                    phone: data.phone,
                                    name: data.name,
                                    // email omitted
                                    store: data.store
                                }
                            });
                            strapi.log.info(`[Reservation] Created customer (without email) for phone: ${data.phone}`);
                        } catch (retryErr) {
                            strapi.log.error('[Reservation] Failed to create customer even without email:', retryErr);
                        }
                    }
                }

                if (customer) {
                    linkedCustomerId = customer.id;
                    linkedCustomerData = customer;
                    strapi.log.info(`[Reservation] Pre-linked Customer: ID=${customer.id}`);

                    if (customer.internalNote) customerContextText += `顧客メモ: ${customer.internalNote}\n`;
                    if (customer.reservations && customer.reservations.length > 0) {
                        const pastNotes = customer.reservations
                            .filter((r: any) => r.notes && r.notes.trim() !== '')
                            .slice(-3)
                            .map((r: any) => r.notes)
                            .join(" / ");
                        if (pastNotes) customerContextText += `過去の要望: ${pastNotes}`;
                    }
                }
            } catch (e) {
                strapi.log.error('[Reservation] Error in customer linking process:', e);
            }
        }

        // Transaction Wrapper
        return await strapi.db.transaction(async (transaction) => {
            try {
                // Ensure data is ready (ctx.request.body is reference, so modifying 'data' above might persist, but better explicit)
                if (linkedCustomerId) {
                    data.customer = linkedCustomerId;
                }
                if (data && data.store && data.date && data.time && data.guests) {
                    // Skip check logic if requested (e.g. Owner Override)
                    if (!data.skipAvailabilityCheck && (!data.assignedTables || data.assignedTables.length === 0)) {
                        const storeService = strapi.service('api::store.store');
                        // コースIDが指定されている場合はcheckAvailabilityに渡す
                        const courseId = data.courseId || null;
                        const result = await (storeService as any).checkAvailability(
                            data.store,
                            data.date,
                            data.time,
                            data.guests,
                            courseId
                        );

                        if (!result.available) {
                            return ctx.badRequest('Reservation rejected: ' + (result.reason || 'No availability'), {
                                reason: result.reason,
                                action: result.action
                            });
                        }

                        // Apply Auto-assigned tables
                        if (result.candidateTable) {
                            data.assignedTables = [result.candidateTable.documentId];
                        }
                        if (result.assignedTables && result.assignedTables.length > 0) {
                            data.assignedTables = result.assignedTables.map((t: any) => t.documentId);
                        }

                        // Ticket 01 & 02: Force Duration & Calculate Metrics
                        // checkAvailability returns requiredDuration based on StoreConfig
                        if (result.requiredDuration) {
                            data.duration = result.requiredDuration;
                        }
                        // コース名を保存
                        if (result.courseName) {
                            data.course = result.courseName;
                        }

                        // Store ID/Locale Fixes
                        if (result.storeIdInt) data.store = result.storeIdInt;
                        if (result.storeLocale) data.locale = result.storeLocale;

                        // Ticket-AI-02 & 05: AI Note Classification & Auto-Transcription
                        let aiRequiresAction = false;
                        if (data.notes) {
                            try {
                                const aiResult = await AiService.classifyNote(data.notes);
                                data.aiAnalysisResult = aiResult;
                                data.aiReason = aiResult.reason;
                                aiRequiresAction = aiResult.requiresAction;
                                strapi.log.info(`[Reservation] AI Classify: Action=${aiRequiresAction}, Reason=${aiResult.reason}, Trait=${aiResult.customerTrait}`);

                                // Ticket-AI-05: Auto-Transcription to Customer Note
                                if (aiResult.customerTrait && linkedCustomerId) {
                                    /*
                                     * Note: We are inside a transaction wrapper for Reservation Creation.
                                     * Updating Customer here is safe.
                                     * Strapi v5: Use documents API for ID update.
                                     */
                                    try {
                                        // Fetch latest note content first to ensure we append correctly
                                        // linkedCustomerData might be stale if updated recently? 
                                        // Transaction isolation should handle it, but for safety lets re-fetch lightweight or use append logic?
                                        // For simplicity, use the ID we have.

                                        // We need to fetch the current note inside transaction if possible, or just overwrite safely?
                                        // Strapi update doesn't support "SQL Append". We must Read -> Modify -> Write.
                                        const targetCustomer = await strapi.documents('api::customer.customer').findOne({
                                            documentId: linkedCustomerId
                                        });

                                        if (targetCustomer) {
                                            const todayStr = new Date().toLocaleDateString('ja-JP');
                                            const appendText = `\n\n【${todayStr} AI自動転記】\n${aiResult.customerTrait}`;
                                            const newNote = (targetCustomer.internalNote || "") + appendText;

                                            await strapi.documents('api::customer.customer').update({
                                                documentId: linkedCustomerId,
                                                data: {
                                                    internalNote: newNote
                                                }
                                            });
                                            strapi.log.info(`[Reservation] Auto-Transcribed trait to Customer ${linkedCustomerId}`);
                                        }
                                    } catch (traitErr) {
                                        strapi.log.error('[Reservation] Auto-Transcription Error:', traitErr);
                                        // Do not fail reservation creation for this
                                    }
                                }

                            } catch (e) {
                                strapi.log.error(`[Reservation] AI Classify Error:`, e);
                                aiRequiresAction = true; // Safety fallback
                            }
                        }

                        // Ticket-AI-03: CRM Advice (Using pre-calculated context)
                        if (data.phone) {
                            try {
                                // If there is context or current notes, generate advice
                                // Use customerContextText prepared outside
                                if (customerContextText || (data.notes && data.notes.trim())) {
                                    const advicePrompt = `
                                      あなたはレストランの店主をサポートするAIです。
                                      過去の顧客情報と今回の要望から、店主への接客アドバイスを生成してください。
                                      
                                      顧客情報: ${customerContextText || "なし"}
                                      今回の要望: ${data.notes || "なし"}
                                      
                                      出力はアドバイスのテキストのみ（簡潔に一言二言で）。
                                    `;
                                    const advice = await AiService.generateLite(advicePrompt);
                                    data.aiAdvice = advice;
                                    strapi.log.info(`[Reservation] AI Advice Generated.`);
                                }
                            } catch (e) {
                                strapi.log.error(`[Reservation] AI Advice Error:`, e);
                            }
                        }

                        // Ticket Auto-Confirm: Override status based on Store Config
                        console.log(`[ReservationController] Auto-Confirm Check: Mode=${result.bookingAcceptanceMode}, Action=${result.action}`);
                        if (result.bookingAcceptanceMode === 'auto' && result.action === 'proceed') {
                            if (aiRequiresAction) {
                                strapi.log.info('[Reservation] AI Override: Notes require action. Status -> pending.');
                                data.status = 'pending';
                                data.requiresReview = true;
                            } else {
                                data.status = 'confirmed';
                                data.confirmedAt = new Date().toISOString();
                            }
                        }
                    }
                }

                // 2. Enforce Metrics (endTime, isOvernight) logic
                // Even if manually created, we need to ensure these are correct
                if (data.store && data.time && data.duration) {
                    // We might need to fetch store config if not passed? 
                    // But checkAvailability usually ensures data.duration is set.
                    // If manual override (owner), they set duration? 
                    // For Ticket 02: "Backend determines". 
                    // Check if duration is missing, resolve it again if so.
                    if (!data.duration) {
                        // Ticket 01: Ensure full store config is loaded
                        const storeEnt = await strapi.entityService.findOne('api::store.store', data.store, {
                            populate: ['menuItems'] as any
                        });
                        const config = StoreConfig.resolve(storeEnt);
                        const menuItems = (storeEnt as any)?.menuItems || [];

                        console.log(`[Reservation] Manual Duration Resolution: TargetTime=${data.time}, CourseId=${data.courseId || 'none'}`);

                        // === USE StoreDomain.getCourseDuration for duration calculation (includes course support) ===
                        const durationResult = StoreDomain.getCourseDuration(data.courseId || null, menuItems, data.time, config);
                        data.duration = durationResult.duration;
                        if (durationResult.courseName) {
                            data.course = durationResult.courseName;
                        }
                        console.log(`[Reservation] Applied Duration via StoreDomain: ${data.duration} min (source: ${durationResult.source})`);
                    }

                    const startMin = timeToMinutes(data.time);
                    const endMin = startMin + Number(data.duration);

                    // Format endTime (HH:mm:ss)
                    // Handle cross-day: minutesToTime handles > 1440? 
                    // We assume standard HH:mm. If > 24h, modulo it?
                    // Ticket 02 advice: "endTime as clock suggests", "isOvernight flag"

                    let clockMin = endMin;
                    let isOvernight = false;
                    if (clockMin >= 1440) {
                        clockMin -= 1440;
                        isOvernight = true;
                    }
                    // If effectively 24:00 (00:00), it's overnight
                    if (endMin >= 1440) isOvernight = true;

                    // Format to HH:mm. Strapi Time type needs HH:mm:ss.000
                    const h = Math.floor(clockMin / 60);
                    const m = clockMin % 60;
                    const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00.000`;

                    data.endTime = timeStr;
                    data.isOvernight = isOvernight;

                    // Initialize laneIndex? Let recalculate handle it.
                    data.laneIndex = 0;
                }

                // === PHASE 1: OVERLAP DOUBLE-CHECK (競合状態対策) ===
                // トランザクション内で最終確認: INSERT直前に重複予約がないかチェック
                // これにより "check → create" 間のギャップでの競合を検出
                // 注意: カウンター席は複数予約が同時使用可能なので、競合チェック対象外
                if (data.store && data.date && data.time && data.assignedTables && data.assignedTables.length > 0) {
                    const startMin = timeToMinutes(data.time);
                    const endMin = startMin + Number(data.duration || 90);

                    // テーブル情報を取得して、カウンター席かどうかを判定
                    const requestedTables = await strapi.db.query('api::table.table').findMany({
                        where: {
                            documentId: { $in: data.assignedTables }
                        }
                    });

                    // 非カウンター席のみを競合チェック対象にする
                    const nonCounterTableIds = requestedTables
                        .filter((t: any) => t.type !== 'counter')
                        .map((t: any) => t.documentId);

                    // カウンター席のみの予約は競合チェックをスキップ
                    if (nonCounterTableIds.length === 0) {
                        strapi.log.info('[Reservation] Counter-only reservation, skipping overlap check');
                    } else {
                        // 同じ日・同じ店舗で予約を検索
                        const conflictingReservations = await strapi.db.query('api::reservation.reservation').findMany({
                            where: {
                                date: data.date,
                                status: { $ne: 'canceled' },
                            },
                            populate: ['assignedTables'],
                        });

                        const requestedTableIdSet = new Set(nonCounterTableIds);

                        for (const existing of conflictingReservations) {
                            // 既存予約のテーブル取得（非カウンターのみ）
                            const existingTables = (existing as any).assignedTables || [];
                            const existingNonCounterTableIds = existingTables
                                .filter((t: any) => t.type !== 'counter')
                                .map((t: any) => t.documentId);

                            // 非カウンターテーブルの重複チェック
                            const hasTableConflict = existingNonCounterTableIds.some((id: string) => requestedTableIdSet.has(id));
                            if (!hasTableConflict) continue;

                            // 時間の重複チェック
                            const existingStartMin = timeToMinutes((existing as any).time);
                            const existingEndMin = existingStartMin + Number((existing as any).duration || 90);

                            if (StoreDomain.isTimeOverlap(startMin, endMin, existingStartMin, existingEndMin)) {
                                // 競合検出！
                                strapi.log.warn(`[Reservation] Overlap detected: 
                                    New=${data.time}-${minutesToTime(endMin)}, 
                                    Existing=${existing.time}-${minutesToTime(existingEndMin)}, 
                                    Table=${existingNonCounterTableIds.join(',')}`);

                                return ctx.conflict('Reservation conflict: Table already reserved for this time slot', {
                                    reason: 'overlapping_reservation',
                                    existingReservation: {
                                        id: (existing as any).documentId,
                                        time: (existing as any).time,
                                        endTime: (existing as any).endTime,
                                        name: (existing as any).name,
                                    }
                                });
                            }
                        }
                    }
                }

                // 3. Create Entity (with Transaction)
                // @ts-ignore
                const newReservation = await strapi.entityService.create('api::reservation.reservation', {
                    data,
                    transaction,
                    populate: ['store', 'assignedTables']
                });

                // 4. Recalculate Lanes (Ticket 02)
                if (data.store && data.date) {
                    await strapi.service('api::reservation.reservation').recalculateDailyLaneIndices(
                        data.store,
                        data.date,
                        transaction
                    );
                }

                const sanitized = await this.sanitizeOutput(newReservation, ctx);
                return this.transformResponse(sanitized);

            } catch (error) {
                strapi.log.error('Creation Error:', error);
                throw error; // Transaction rollback
            }
        });
    },

    async update(ctx) {
        const { id } = ctx.params; // DocumentID in Strapi 5
        const { data } = ctx.request.body;

        // Note: strapi.documents API is preferred in v5 for documentId handling
        return await strapi.db.transaction(async (transaction) => {
            console.log(`[Reservation] Update Request. ID: ${id}`);

            // Fetch existing using documents API
            const existing = await strapi.documents('api::reservation.reservation').findOne({
                documentId: id,
                populate: ['store']
            });

            console.log(`[Reservation] Update Found Existing:`, existing ? `YES (ID: ${existing.documentId})` : 'NO');

            if (!existing) return ctx.notFound();

            // 2. Logic: If time/duration changed, re-calc endTime/isOvernight
            if (data.time || data.duration) {
                const time = data.time || existing.time;
                let duration = data.duration || existing.duration;

                const startMin = timeToMinutes(time);
                const endMin = startMin + Number(duration);

                let clockMin = endMin;
                let isOvernight = false;
                if (clockMin >= 1440) {
                    clockMin -= 1440;
                    isOvernight = true;
                }
                const h = Math.floor(clockMin / 60);
                const m = clockMin % 60;
                data.endTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00.000`;
                data.isOvernight = isOvernight;
            }

            // 3. Update using documents API
            const updated = await strapi.documents('api::reservation.reservation').update({
                documentId: id,
                data,
                populate: ['store', 'assignedTables'],
                status: 'published' // Ensure we work on published version if draft/publish enabled (disabled here but safe to add)
            });

            // 4. Recalculate Lanes
            const oldDate = existing.date;
            const newDate = data.date || existing.date;
            const storeId = existing.store ? existing.store.documentId : null;

            if (storeId) {
                // recalculateDailyLaneIndices uses entityService inside? Need to check service compatibility?
                // Service logic should be robust.
                await strapi.service('api::reservation.reservation').recalculateDailyLaneIndices(storeId, oldDate, transaction);
                if (oldDate !== newDate) {
                    await strapi.service('api::reservation.reservation').recalculateDailyLaneIndices(storeId, newDate, transaction);
                }
            }

            const sanitized = await this.sanitizeOutput(updated, ctx);
            return this.transformResponse(sanitized);
        });
    },

    async delete(ctx) {
        const { id } = ctx.params;

        return await strapi.db.transaction(async (transaction) => {
            const existing = await strapi.documents('api::reservation.reservation').findOne({
                documentId: id,
                populate: ['store']
            });

            if (!existing) return ctx.notFound();

            // Delete using documents API
            const deleted = await strapi.documents('api::reservation.reservation').delete({
                documentId: id
            });

            if (existing.store && existing.date) {
                await strapi.service('api::reservation.reservation').recalculateDailyLaneIndices(
                    existing.store.documentId,
                    existing.date,
                    transaction
                );
            }

            const sanitized = await this.sanitizeOutput(deleted, ctx);
            return this.transformResponse(sanitized);
        });
    },

    // Keep default find/findOne?
    // User Ticket01 customized them to inject duration.
    // Ticket 02 persists duration, so we can revert find/findOne customizations?
    // "Backend determines ... persist directly." -> This implies reading is standard now.
    // **YES**, we can remove the 'on-the-fly calculation' in find/findOne!
    // This is a great simplification and performance boost.

    // Using default find/findOne
    async find(ctx) {
        return await super.find(ctx);
    },
    async findOne(ctx) {
        return await super.findOne(ctx);
    }
}));
