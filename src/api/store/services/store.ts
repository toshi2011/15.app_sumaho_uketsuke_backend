// Force Rebuild Timestamp
import { factories } from '@strapi/strapi';
import { timeToMinutes, normalizeBusinessHours } from '../../../utils/timeUtils';
// import * as fs from 'fs';
// import * as path from 'path';

const log = (message: string) => {
    try {
        // const logPath = path.join(process.cwd(), 'debug_log.txt');
        // const timestamp = new Date().toISOString();
        // fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
        strapi.log.debug(`[StoreService] ${message}`);
    } catch (e) {
        // ignore
    }
};

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

            // Use lastOrder if available
            const lunchLastOrderStr = bh.lunch?.lastOrder;
            const lunchEndMin = normalizeBusinessHours(lunchStartMin, timeToMinutes(lunchEndStr));

            let lunchLastOrderMin = lunchEndMin;
            if (lunchLastOrderStr) {
                lunchLastOrderMin = normalizeBusinessHours(lunchStartMin, timeToMinutes(lunchLastOrderStr));
            }

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

            // Rule B: Range Classification & Gap Check
            if (targetStartMin >= lunchStartMin && targetStartMin < lunchEndMin) {
                isLunch = true;
                currentCleanUp = lunchCleanUp;
                currentBaseDuration = lunchDuration;
            } else if (targetStartMin >= dinnerStartMin && targetStartMin < dinnerEndMin) {
                isLunch = false;
                currentCleanUp = dinnerCleanUp;
                currentBaseDuration = dinnerDuration;
            } else {
                return {
                    available: false,
                    capacityUsed: 0,
                    requiredDuration: 0,
                    reason: `Outside of business hours. Lunch: ${lunchStartStr}~${lunchEndStr}, Dinner: ${dinnerStartStr}~${dinnerEndStr}`,
                    action: 'reject'
                };
            }

            // Duration Calculation
            // Duration Calculation
            // 【仕様変更】人数による自動延長機能（dynamicDurationRate）を廃止
            // 常に店舗設定のランチ/ディナー滞在時間を適用する
            let requiredDuration = Math.min(currentBaseDuration, maxDurationLimit);

            const targetEndMin = targetStartMin + requiredDuration;
            const targetEndWithBuffer = targetEndMin + currentCleanUp;

            // 【仕様変更】
            // 閉店ルールはランチとディナーで異なります。
            // ランチ: ラストオーダー方式 (終了時間の15分前までに入店すればOK)
            // ディナー: 厳格な閉店時間 (退店時間が閉店時間を超えてはいけない)
            // Rule C: Closing Time Constraint

            let closingMin = isLunch ? lunchEndMin : dinnerEndMin;

            if (isLunch) {
                // Lunch: Last Order Logic
                // Allow if start time is <= LO - 15 min
                // lunchLastOrderMin is either proper LO time or End time if LO not set.

                const lastOrderLimit = lunchLastOrderMin - 15;

                if (targetStartMin > lastOrderLimit) {
                    // Determine string to show for LO
                    const loTimeStr = lunchLastOrderStr || lunchEndStr;
                    return {
                        available: false,
                        capacityUsed: 0,
                        requiredDuration,
                        reason: `Lunch Last Order exceeded. LO is 15 min before ${loTimeStr}. Max start: ${lastOrderLimit} min. Target: ${targetStartMin}`,
                        action: 'reject'
                    };
                }
                // For Lunch, we DO NOT check if targetEndWithBuffer > closingMin.
            } else {
                // Dinner: Strict Closing Logic
                if (targetEndWithBuffer > closingMin) {
                    const maxPossible = closingMin - targetStartMin - currentCleanUp;
                    return {
                        available: false,
                        capacityUsed: 0,
                        requiredDuration,
                        reason: `Exceeds closing time. Max duration available: ${maxPossible} min`,
                        action: 'reject'
                    };
                }
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

                // 【仕様変更】既存予約の所要時間計算も一律設定を適用
                const rDuration = Math.min(rBase, maxDurationLimit);

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
                    // block内の席が本当に連番か確認（sortOrderが連続しているか）
                    // データ不整合でsortOrderが飛んでいる場合もあるので、厳密にするならここでチェック
                    // 今回は単純にリスト上の並びで判断（「空いている席」の並びなので、物理的に隣とは限らないが...
                    // 修正: これだと「C1, C3」が空いている時に連番とみなされる。
                    // 物理的な連番チェックにはSortOrderの差を見る必要がある。
                    const isSequential = block.every((t: any, idx: number) => {
                        if (idx === 0) return true;
                        return (t.sortOrder - block[idx - 1].sortOrder) === 1;
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
                    action: 'proceed',
                    candidateTable: candidateTable,
                    assignedTables: assignedTables, // 新規追加: 複数テーブル配列
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
