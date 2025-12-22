import { factories } from '@strapi/strapi';
import { timeToMinutes, normalizeBusinessHours } from '../../../utils/timeUtils';

export default factories.createCoreService('api::store.store', ({ strapi }) => ({
    async checkAvailability(storeId, date, time, guests) {
        try {
            // 1. Fetch store settings and tables
            let store = await strapi.entityService.findOne('api::store.store', storeId, {
                populate: ['tables']
            });

            if (!store) {
                // Try DB query fallback if entityService fails (rare for valid ID)
                store = await strapi.db.query('api::store.store').findOne({
                    where: { documentId: storeId },
                    populate: ['tables']
                });
            }

            if (!store) {
                console.warn(`checkAvailability: Store not found for ID: ${storeId}`);
                return { available: false, capacityUsed: 0, requiredDuration: 0, reason: 'Store not found', action: 'reject' };
            }

            console.log(`[DEBUG] checkAvailability (TableLogic): storeId=${storeId}, date=${date}, time=${time}, guests=${guests}`);
            // Log locale
            console.log(`[DEBUG] Store Locale: ${(store as any).locale}`);

            const maxCapacity = store.maxCapacity ?? 20; // Global fallback
            const maxGroupsPerSlot = store.maxGroupsPerSlot ?? 5; // Global fallback

            // ... Time Logic (reuse existing) ...
            const bh: any = (store as any).businessHours || {};
            const lunchStartStr = bh.lunch?.start || "11:00";
            const lunchEndStr = bh.lunch?.end || store.lunchEndTime || "15:00";
            const dinnerStartStr = bh.dinner?.start || "17:00";
            const dinnerEndStr = bh.dinner?.end || "23:00";

            // 【仕様変更】
            // UI設定項目削除に伴い、バッファ時間は強制的に0として扱います。
            // 店主は平均滞在時間に片付け時間を含めて設定することが推奨されます。
            const lunchCleanUp = 0;
            const dinnerCleanUp = 0;

            // Durations
            const lunchDuration = store.lunchDuration ?? 90;
            const dinnerDuration = store.dinnerDuration ?? 120;
            const maxDurationLimit = store.maxDurationLimit ?? 180;

            // Integer Conversion
            const lunchStartMin = timeToMinutes(lunchStartStr);
            const lunchEndMin = normalizeBusinessHours(lunchStartMin, timeToMinutes(lunchEndStr));
            const dinnerStartMin = timeToMinutes(dinnerStartStr);
            let dinnerEndMin = timeToMinutes(dinnerEndStr);
            dinnerEndMin = normalizeBusinessHours(dinnerStartMin, dinnerEndMin);

            let targetStartMin = timeToMinutes(time);
            if (dinnerEndMin > 1440 && targetStartMin < lunchStartMin) {
                targetStartMin += 1440;
            }

            let isLunch = false;
            let currentCleanUp = 0;
            let currentBaseDuration = 90;

            if (targetStartMin >= lunchStartMin && targetStartMin < lunchEndMin) {
                isLunch = true;
                currentCleanUp = lunchCleanUp;
                currentBaseDuration = lunchDuration;
            } else if (targetStartMin >= dinnerStartMin && targetStartMin < dinnerEndMin) {
                isLunch = false;
                currentCleanUp = dinnerCleanUp;
                currentBaseDuration = dinnerDuration;
            } else {
                currentCleanUp = dinnerCleanUp;
                currentBaseDuration = dinnerDuration;
            }

            // Duration Calculation
            const dynamicDurationRate = store.dynamicDurationRate ?? 10;
            const extraGuests = Math.max(0, guests - 2);
            const addedTime = extraGuests * dynamicDurationRate;
            let requiredDuration = Math.min(currentBaseDuration + addedTime, maxDurationLimit);

            const targetEndMin = targetStartMin + requiredDuration;
            const targetEndWithBuffer = targetEndMin + currentCleanUp;

            // 【仕様変更】
            // 閉店ルールは「厳格（時間内退店）」のみサポートします。
            // 予約終了時間が営業終了時間を超える場合は予約不可とします。
            // Rule C: Closing Time Constraint
            let closingMin = isLunch ? lunchEndMin : dinnerEndMin;
            if (targetEndWithBuffer > closingMin) {
                const maxPossible = closingMin - targetStartMin - currentCleanUp;
                return {
                    available: false,
                    capacityUsed: 0,
                    requiredDuration,
                    reason: `Exceeds closing time. Max duration available: ${maxPossible} min`,
                    action: 'reject' // 【仕様変更】常にrejectを返す（call_request等の曖昧なステータスを返さない）
                };
            }

            // 4. Rule A: Table Inventory Check
            // Fetch ALL reservations for this store on this date to check overlap
            const allReservations = await strapi.entityService.findMany('api::reservation.reservation', {
                filters: {
                    date: date,
                    status: { $ne: 'canceled' },
                    store: store.id as any
                },
                populate: ['assignedTables']
            });

            // Identify overlapping reservations
            const overlappingReservations = allReservations.filter((res) => {
                let resStart = timeToMinutes(res.time);
                if (resStart === -1) return false;

                if (dinnerEndMin > 1440 && resStart < lunchStartMin) resStart += 1440;

                // Infer duration for existing res (since we don't store it)
                let rIsLunch = (resStart >= lunchStartMin && resStart < lunchEndMin);
                let rBase = rIsLunch ? lunchDuration : dinnerDuration;
                let rCleanUp = rIsLunch ? lunchCleanUp : dinnerCleanUp;

                const rGuests = res.guests || 2;
                const rExtra = Math.max(0, rGuests - 2);
                const rDuration = Math.min(rBase + rExtra * dynamicDurationRate, maxDurationLimit);

                const resEnd = resStart + rDuration;
                const theirEnd = resEnd + rCleanUp;
                const myStart = targetStartMin;
                const myEnd = targetEndWithBuffer; // already includes cleanup

                // Overlap: My Start < Their End AND Their Start < My End
                return (myStart < theirEnd) && (resStart < myEnd);
            });

            // Identify used tables (Reserved Tables)
            const usedTableIds = new Set<number>();
            let unassignedReservationCount = 0;

            overlappingReservations.forEach(r => {
                const res = r as any;
                if (res.assignedTables && res.assignedTables.length > 0) {
                    res.assignedTables.forEach((t: any) => usedTableIds.add(t.id));
                } else {
                    unassignedReservationCount++;
                }
            });

            // Available Tables = Store Tables - Used Tables
            const tables = (store as any).tables || [];
            const activeTables = tables.filter((t: any) => t.isActive);
            const availableTables = activeTables.filter((t: any) => !usedTableIds.has(t.id));

            console.log(`[DEBUG] Tables Total: ${tables.length}, Active: ${activeTables.length}, Used: ${usedTableIds.size}, Free: ${availableTables.length}, Unassigned Res: ${unassignedReservationCount}`);

            // Find candidates
            // Strategy: Find ANY single table that fits 'guests'
            // We compare guests vs maxCapacity (or baseCapacity?)
            // Usually maxCapacity is the hard limit.

            // Note: If unassignedReservationCount > 0, we technically have "Ghost" usage. 
            // In a strict system, we might subtract `unassignedReservationCount` from the count of available tables?
            // But we don't know the capacity of those unassigned bookings.
            // For now, we proceed with availableTables but LOG the warning.

            const candidate = availableTables.find((t: any) => {
                const tMax = t.maxCapacity || t.baseCapacity || t.capacity || 20; // Robust fallback
                return tMax >= guests;
            });

            if (candidate) {
                // Determine capacity usage roughly
                const totalUsed = overlappingReservations.reduce((acc, r) => acc + (r.guests || 0), 0);
                const capacityUsed = Math.round((totalUsed / (store.maxCapacity || 100)) * 100);

                return {
                    available: true,
                    capacityUsed,
                    requiredDuration,
                    action: 'proceed',
                    candidateTable: candidate,
                    storeLocale: (store as any).locale,
                    storeIdInt: (store as any).id
                };
            } else {
                return {
                    available: false,
                    capacityUsed: 100, // Effectively full for this request
                    requiredDuration,
                    reason: 'No suitable table available',
                    action: 'reject'
                };
            }

        } catch (error) {
            console.error('Error in checkAvailability:', error);
            return { available: false, capacityUsed: 0, requiredDuration: 90, reason: String(error), action: 'reject' };
        }
    },
}));
