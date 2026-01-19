// Force Rebuild Timestamp: Refactor 2026-01-14 Fix Lint
import { factories } from '@strapi/strapi';
import { timeToMinutes, normalizeBusinessHours } from '../../../utils/timeUtils';
import { StoreConfig } from '../../../core/config/StoreConfig';

const log = (message: string) => {
    try {
        strapi.log.debug(`[StoreService] ${message}`);
    } catch (e) {
        // ignore
    }
};

const formatMin = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export default factories.createCoreService('api::store.store', ({ strapi }) => ({
    async checkAvailability(storeDocumentId, date, time, guests) {
        try {
            // 1. Fetch store settings and tables
            // Ticket 01: Explicitly use documentId
            let store = await strapi.entityService.findOne('api::store.store', storeDocumentId, {
                populate: '*' // StoreConfig用の設定値を全て取得するため '*' に変更
            });

            if (!store) {
                // Try DB query fallback if entityService fails (rare for valid ID)
                store = await strapi.db.query('api::store.store').findOne({
                    where: { documentId: storeDocumentId },
                    populate: true // DB Queryでは true で全リレーション・フィールド取得
                });
            }

            if (!store) {
                console.warn(`checkAvailability: Store not found for ID: ${storeDocumentId}`);
                return { available: false, capacityUsed: 0, requiredDuration: 0, reason: 'Store not found', action: 'reject' };
            }

            console.log(`[DEBUG] checkAvailability (TableLogic): storeDocumentId=${storeDocumentId}, date=${date}, time=${time}, guests=${guests}`);

            // === USE CENTRALIZED CONFIG ===
            // console.log(`[DEBUG] Raw Store Config Candidates: lunchDuration=${(store as any).lunchDuration}, dinnerDuration=${(store as any).dinnerDuration}`);
            const config = StoreConfig.resolve(store);
            console.log(`[StoreService] Resolved Config for DocID ${storeDocumentId}: LunchDur=${config.lunchDuration}, DinnerDur=${config.dinnerDuration}, LunchStart=${formatMin(config.lunchStartMin)}`);

            const targetStartMin = timeToMinutes(time);
            let adjustedTargetStart = targetStartMin;
            // Handle late night boundary if needed
            if (config.dinnerEndMin > 1440 && targetStartMin < config.lunchStartMin) {
                adjustedTargetStart += 1440;
            }

            let isLunch = false;
            let currentBaseDuration = 90;
            let closingMin = 0;

            // Rule B: Range Classification & Gap Check
            if (adjustedTargetStart >= config.lunchStartMin && adjustedTargetStart < config.lunchEndMin) {
                isLunch = true;
                currentBaseDuration = config.lunchDuration;
                closingMin = config.lunchEndMin;
            } else if (adjustedTargetStart >= config.dinnerStartMin && adjustedTargetStart < config.dinnerEndMin) {
                isLunch = false;
                currentBaseDuration = config.dinnerDuration;
                closingMin = config.dinnerEndMin;
            } else {
                return {
                    available: false,
                    capacityUsed: 0,
                    requiredDuration: 0,
                    reason: `Outside of business hours. Lunch: ${formatMin(config.lunchStartMin)}~${formatMin(config.lunchEndMin)}, Dinner: ${formatMin(config.dinnerStartMin)}~${formatMin(config.dinnerEndMin)}`,
                    action: 'reject'
                };
            }

            // Duration Calculation
            let requiredDuration = Math.min(currentBaseDuration, config.maxDuration);

            const targetEndMin = adjustedTargetStart + requiredDuration;
            const targetEndWithBuffer = targetEndMin + config.cleanupDuration;

            // Rule C: Closing Time Constraint
            if (isLunch) {
                // Lunch: Last Order Logic
                const lastOrderLimit = closingMin - config.lastOrderOffset;

                if (adjustedTargetStart > lastOrderLimit) {
                    return {
                        available: false,
                        capacityUsed: 0,
                        requiredDuration,
                        reason: `Lunch Last Order exceeded. Max start: ${formatMin(lastOrderLimit)}. Target: ${time}`,
                        action: 'reject'
                    };
                }
            } else {
                if (targetEndWithBuffer > closingMin) {
                    const maxPossible = closingMin - adjustedTargetStart - config.cleanupDuration;
                    return {
                        available: false,
                        capacityUsed: 0,
                        requiredDuration,
                        endTime: null,
                        isOvernight: false,
                        reason: `Exceeds closing time. Max duration available: ${maxPossible} min`,
                        action: 'reject'
                    };
                }
            }

            // Calculate EndTime/Overnight for valid response
            let clockMin = targetEndMin;
            let isOvernight = false;
            if (clockMin >= 1440) {
                clockMin -= 1440;
                isOvernight = true;
            }
            const h = Math.floor(clockMin / 60);
            const m = clockMin % 60;
            // HH:mm format for frontend/logic usage (API uses HH:mm:ss.SSS for Time type)
            const endTimeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

            // 4. Rule A: Table Inventory Check
            // Fetch ALL reservations for this store on this date to check overlap
            const allReservations = await strapi.entityService.findMany('api::reservation.reservation', {
                filters: {
                    date: date,
                    status: { $ne: 'canceled' },
                    store: store.documentId as any // Cast to any to avoid strict type mismatch during build
                },
                populate: ['assignedTables']
            });

            // Identify overlapping reservations
            const overlappingReservations = allReservations.filter((res) => {
                let resStart = timeToMinutes(res.time);
                if (resStart === -1) return false;

                if (config.dinnerEndMin > 1440 && resStart < config.lunchStartMin) resStart += 1440;

                // Infer duration for existing res (using same logic as target)
                let rIsLunch = (resStart >= config.lunchStartMin && resStart < config.lunchEndMin);
                let rBase = rIsLunch ? config.lunchDuration : config.dinnerDuration;

                // Use stored duration if available (preferred), else use config default
                const storedDuration = (res as any).duration;
                const rDuration = Math.min(storedDuration || rBase, config.maxDuration);

                // Assuming cleanup is 0 as per config, but if we had it, we'd add it here
                const resEnd = resStart + rDuration;
                const theirEnd = resEnd + config.cleanupDuration;

                const myStart = adjustedTargetStart;
                const myEnd = targetEndWithBuffer;

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

            // 5. 【最適化エンジン】優先順位に基づいたソート
            // 4. 収容可能（人数が収まる）な席に絞り込み
            let assignedTables: any[] = [];
            let candidateTable: any = null;

            // 特殊ロジック: カウンター席（定員1名）の複数割り当て
            // 条件: ゲスト数 <= 4 (あまり大人数でカウンター連番は難しいため制限してもよいが、ここでは柔軟に)
            // かつ、カウンター席の在庫がある場合
            const counterSeats = availableTables.filter((t: any) =>
                (t.type === 'counter' || t.name.includes('カウンター')) &&
                (t.maxCapacity === 1 || t.capacity === 1)
            );

            // カウンターロジックを試行するか？（少人数、またはカウンター希望ロジックがあれば）
            // ここでは「カウンター席が人数分以上空いていれば」優先的にチェックする戦略とします。
            // ただし、テーブル席の方が良い場合もあるため、あくまで「候補」として並列で考えるか、
            // 「2名以下ならカウンター優先」などのルールに従う。

            // ルール: 2名以下ならカウンターを優先して確保を試みる
            // それ以上、またはカウンター確保失敗ならテーブル席を探す

            let counterSuccess = false;

            if (guests <= 3 && counterSeats.length >= guests) {
                // ソート（名前順やsortOrder順）
                counterSeats.sort((a: any, b: any) => (a.sortOrder || 999) - (b.sortOrder || 999));

                // 1. 連番（Sequential）チェック
                for (let i = 0; i <= counterSeats.length - guests; i++) {
                    const block = counterSeats.slice(i, i + guests);

                    const isSequential = block.every((t: any, idx: number) => {
                        if (idx === 0) return true;
                        const prev = block[idx - 1];

                        // 1. Try SortOrder
                        if (t.sortOrder && prev.sortOrder) {
                            if (t.sortOrder - prev.sortOrder === 1) return true;
                        }

                        // 2. Fallback: Name-based check (e.g. "Counter-1", "Counter-2")
                        const nameMatch = t.name.match(/(\d+)$/);
                        const prevMatch = prev.name.match(/(\d+)$/);
                        if (nameMatch && prevMatch) {
                            const num = parseInt(nameMatch[1], 10);
                            const prevNum = parseInt(prevMatch[1], 10);
                            if (num - prevNum === 1) return true;
                        }

                        return false;
                    });

                    if (isSequential) {
                        assignedTables = block;
                        counterSuccess = true;
                        console.log(`[StoreService] Assigned Sequential Counters: ${block.map((t: any) => t.name).join(', ')}`);
                        break;
                    }
                }

                // 2. バラ席（Scattered）チェック（連番失敗時）
                // 2名ならバラ席でも許容するか？ -> 基本は連番推奨だが、空いていれば案内可能とするか。
                if (!counterSuccess && guests <= 2) { // 2名までならバラでもOKとする
                    assignedTables = counterSeats.slice(0, guests);
                    counterSuccess = true;
                    console.log(`[StoreService] Assigned Scattered Counters: ${assignedTables.map((t: any) => t.name).join(', ')}`);
                }
            }

            if (counterSuccess) {
                // カウンター確保成功。
                // candidateTable（代表）は最初の席にしておく（後方互換性のため）
                candidateTable = assignedTables[0];
            } else {
                // 既存のテーブルロジック（単一テーブルで収まる場所を探す）
                const candidateTables = availableTables.filter((t: any) => {
                    const tMax = t.maxCapacity || t.baseCapacity || t.capacity || 20;
                    return tMax >= guests;
                });

                if (candidateTables.length === 0) {
                    return {
                        available: false,
                        capacityUsed: 100, // Effectively full for this request
                        requiredDuration,
                        reason: 'No suitable table available',
                        action: 'reject'
                    };
                }

                candidateTables.sort((a: any, b: any) => {
                    // ルール1: 人数による席タイプの優先順位
                    const typeA = a.type || 'table';
                    const typeB = b.type || 'table';

                    const priority = (guests <= 2)
                        ? { counter: 1, table: 2, private: 3 } // 少人数はカウンター（ここに来るのはCap>=2のカウンターがある場合）
                        : { table: 1, private: 2, counter: 3 };

                    const pA = priority[typeA as keyof typeof priority] ?? 99;
                    const pB = priority[typeB as keyof typeof priority] ?? 99;

                    if (pA !== pB) return pA - pB;

                    // ルール2: ベストフィット
                    const maxCapacityA = a.maxCapacity || a.baseCapacity || 99;
                    const maxCapacityB = b.maxCapacity || b.baseCapacity || 99;
                    return maxCapacityA - maxCapacityB;
                });

                candidateTable = candidateTables[0];
                assignedTables = [candidateTable];
            }


            if (candidateTable) {
                // Determine capacity usage roughly
                const totalUsed = overlappingReservations.reduce((acc, r: any) => acc + (r.guests || 0), 0);
                const capacityUsed = Math.round((totalUsed / (store.maxCapacity || 100)) * 100);

                return {
                    available: true,
                    capacityUsed,
                    requiredDuration,
                    endTime: endTimeStr,
                    isOvernight,
                    action: 'proceed',
                    candidateTable: candidateTable,
                    assignedTables: assignedTables,
                    storeLocale: (store as any).locale,
                    storeIdInt: (store as any).id,
                    bookingAcceptanceMode: (store as any).bookingAcceptanceMode
                };
            } else {
                // Should be covered by length check above, but safe fallback
                return {
                    available: false,
                    capacityUsed: 100,
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
