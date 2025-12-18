import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::store.store', ({ strapi }) => ({
    async checkAvailability(storeId, date, time, guests) {
        try {
            // 1. Fetch store settings with safe defaults
            // BE-105: Fix store lookup to use Document ID
            let store = await strapi.db.query('api::store.store').findOne({
                where: { documentId: storeId }
            });

            if (!store) {
                // Fallback: Try integer ID if storeId is numeric (for legacy calls)
                if (!isNaN(Number(storeId))) {
                    store = await strapi.entityService.findOne('api::store.store', storeId);
                }
            }

            if (!store) {
                console.warn(`checkAvailability: Store not found for ID: ${storeId}`);
                return { available: false, capacityUsed: 0, requiredDuration: 0, reason: 'Store not found', action: 'reject' };
            }

            console.log(`[DEBUG] checkAvailability: storeId=${storeId}, foundStoreId=${store.id}, foundStoreDocId=${store.documentId}`);

            const maxCapacity = store.maxCapacity ?? 20;
            const maxGroupsPerSlot = store.maxGroupsPerSlot ?? 5;
            const cleanUpDuration = store.cleanUpDuration ?? 15;
            const bookingClosingRule = store.bookingClosingRule ?? 'last_order_limit';
            const dynamicDurationRate = store.dynamicDurationRate ?? 10;
            const lunchEndTime = store.lunchEndTime ?? "15:00";
            const lunchDuration = store.lunchDuration ?? 90;
            const dinnerDuration = store.dinnerDuration ?? 120;
            // const maxDurationLimit = 180; // Hardcoded limit for safety

            // 2. Rule B: Dynamic Duration Calculation (Context Switch)
            const isLunch = time < lunchEndTime;
            const baseDuration = isLunch ? lunchDuration : dinnerDuration;
            const extraGuests = Math.max(0, guests - 2);
            const addedTime = extraGuests * dynamicDurationRate;
            const requiredDuration = Math.min(baseDuration + addedTime, 180);

            // Time calculations
            const targetStart = new Date(`${date}T${time}:00`);
            if (isNaN(targetStart.getTime())) {
                return { available: false, capacityUsed: 0, requiredDuration: 0, reason: 'Invalid date or time', action: 'reject' };
            }
            const targetEnd = new Date(targetStart.getTime() + requiredDuration * 60 * 1000);

            // 3. ルール C: 営業時間制約
            // 注記: 簡略化 - 予約が「深夜帯」に完全に含まれるか、妥当な閉店ロジックを超過するかを厳密にチェック
            // businessHours JSONの解析が必要。構造が変動するため、主に「日付」境界または簡易ロジックに対するstrict_closingを検証。
            // 現時点ではフロントエンド／ユーザーが有効な空き枠を提供すると信頼するが、可能な場合は「strict_closing」を強制する。
            // （型定義なしの脆弱なJSON解析を回避するため高度な実装は省略。明らかに無効でない限りオープンにフォールバック）

            // 4. ルールA: 引継ぎ（バッファ）時間と重複チェック
            // FIX: 正しいIDタイプでフィルタリングすることを保証。store.idは通常整数。
            // Strapi 5 EntityServiceは通常'id'（整数）を受け入れるか、リレーション経由でフィルタリングする。
            // 使用されるフィルタをログに記録しよう。

            const filterQuery = {
                date: date,
                store: store.id  // Try direct ID assignment for relation if object syntax fails, or verify object syntax. 
                // In Strapi 4/5 entityService, relation filter usually expects ID or object with ID.
            };

            // Revert to original object syntax but log it to see if it works
            const allReservations = await strapi.entityService.findMany('api::reservation.reservation', {
                filters: {
                    date: date,
                    status: { $ne: 'canceled' },
                    // @ts-ignore
                    store: { documentId: store.documentId }
                },
            });

            console.log(`[DEBUG] checkAvailability: found ${allReservations.length} reservations for date=${date}, store.id=${store.id}`);


            // Helper to calculate usage with variable cleanup buffer
            const calculateUsage = (bufferMinutes: number) => {
                const overlapping = allReservations.filter((res) => {
                    const resStart = new Date(`${date}T${res.time}:00`);
                    if (isNaN(resStart.getTime())) return false;

                    // Calculate existing reservation duration dynamically (same logic as Rule B) to ensure accuracy
                    const rGuests = res.guests || 2;
                    const rIsLunch = res.time < lunchEndTime;
                    const rBase = rIsLunch ? lunchDuration : dinnerDuration;
                    const rExtra = Math.max(0, rGuests - 2);
                    const rDuration = Math.min(rBase + rExtra * dynamicDurationRate, 180);

                    const resEnd = new Date(resStart.getTime() + rDuration * 60 * 1000);

                    // Effective Interval: [Start, End + Buffer]
                    const resEndWithBuffer = new Date(resEnd.getTime() + bufferMinutes * 60 * 1000);
                    const targetEndWithBuffer = new Date(targetEnd.getTime() + bufferMinutes * 60 * 1000);

                    // Overlap Condition: (StartA < EndB) && (StartB < EndA)
                    return (targetStart < resEndWithBuffer) && (resStart < targetEndWithBuffer);
                });

                const currentGuests = overlapping.reduce((sum, res) => sum + (res.guests || 0), 0);
                const currentGroups = overlapping.length;
                return { currentGuests, currentGroups };
            };

            const standardUsage = calculateUsage(cleanUpDuration);
            const newTotalGuests = standardUsage.currentGuests + guests;
            const newTotalGroups = standardUsage.currentGroups + 1;

            const guestsExceeded = newTotalGuests > maxCapacity;
            const groupsExceeded = newTotalGroups > maxGroupsPerSlot;
            const capacityUsed = Math.round((standardUsage.currentGuests / maxCapacity) * 100);

            // 5. Rule D: Actionable Response (Smart Rejection)
            if (guestsExceeded || groupsExceeded) {
                let action = 'reject'; // Default strict reject
                let reason = '';

                if (guestsExceeded) {
                    reason = `Capacity exceeded (${newTotalGuests}/${maxCapacity})`;

                    // Sub-rule: Check for negotiation range (<= 2 people)
                    const overage = newTotalGuests - maxCapacity;
                    if (overage <= 2) {
                        action = 'call_store';
                        reason += ' - Small overage, call to confirm.';
                    } else {
                        // Sub-rule: Check if removing cleanup buffer helps (Time overlap 'near miss')
                        const tightUsage = calculateUsage(0);
                        if (tightUsage.currentGuests + guests <= maxCapacity) {
                            action = 'call_store';
                            reason += ' - Available if cleanup shortened.';
                        }
                    }
                } else {
                    reason = `Max groups exceeded (${newTotalGroups}/${maxGroupsPerSlot})`;
                    // Optional: Allow call if groups are just 1 over? 
                    // User specified thresholds mainly for capacity/time. Keep reject for strict group limits for now or treat same.
                }

                return {
                    available: false,
                    capacityUsed: 100,
                    requiredDuration,
                    reason,
                    action
                };
            }

            return {
                available: true,
                capacityUsed,
                requiredDuration,
                action: 'proceed'
            };

        } catch (error) {
            console.error('Error in checkAvailability:', error);
            // Fail open but with warning? Or fail close?
            // Safer to return available: false if error to prevent double booking in bad state
            return { available: false, capacityUsed: 0, requiredDuration: 90, reason: String(error), action: 'reject' };
        }
    },
}));
