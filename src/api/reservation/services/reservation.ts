import { factories } from '@strapi/strapi';
import { timeToMinutes } from '../../../utils/timeUtils';

export default factories.createCoreService('api::reservation.reservation', ({ strapi }) => ({
    /**
     * 指定された店舗・日付の全予約に対して laneIndex を再計算して保存する
     * @param storeId Store Document ID (or ID, handled by query)
     * @param date Date string YYYY-MM-DD
     * @param transaction Optional transaction object
     */
    async recalculateDailyLaneIndices(storeId: string | number, date: string, transaction?: any) {
        console.log(`[LaneCalc] Called with storeId=${storeId} (type: ${typeof storeId}), date=${date}`);

        // 1. Fetch store to get table definitions
        const store = await strapi.db.query('api::store.store').findOne({
            where: typeof storeId === 'string' ? { documentId: storeId } : { id: storeId },
            populate: ['tables']
        });

        if (!store) {
            console.log(`[LaneCalc] Store not found!`);
            return;
        }

        console.log(`[LaneCalc] Found store: ${(store as any).name}, tables: ${((store as any).tables || []).length}`);

        const counterTableIds = new Set(
            ((store as any).tables || [])
                .filter((t: any) => t.type === 'counter' || t.name?.includes('カウンター'))
                .map((t: any) => t.id)
        );

        console.log(`[LaneCalc] Counter table IDs: ${Array.from(counterTableIds).join(', ') || 'none'}`);

        // 2. Fetch all active reservations for the day, sorted by start time
        const reservations = await strapi.db.query('api::reservation.reservation').findMany({
            where: {
                store: typeof storeId === 'string' ? { documentId: storeId } : { id: storeId },
                date: date,
                status: { $ne: 'canceled' }
            },
            orderBy: { time: 'asc' },
            populate: ['assignedTables'],
        });

        if (!reservations || reservations.length === 0) {
            console.log(`[LaneCalc] No reservations found`);
            return;
        }

        // Deduplicate by documentId (draft and published versions have same documentId)
        const seenDocIds = new Set<string>();
        const uniqueReservations = reservations.filter((res: any) => {
            if (seenDocIds.has(res.documentId)) {
                return false;
            }
            seenDocIds.add(res.documentId);
            return true;
        });

        console.log(`[LaneCalc] Found ${reservations.length} reservations (${uniqueReservations.length} unique)`);

        // 3. Separate reservations into counter and table groups
        const counterReservations: typeof reservations = [];
        const tableReservations: typeof reservations = [];

        uniqueReservations.forEach((res: any) => {
            const assignedIds = res.assignedTables?.map((t: any) => t.id) || [];
            const isCounter = res.assignedTables?.some((t: any) => counterTableIds.has(t.id));
            console.log(`[LaneCalc] Res ${res.name}: assignedTables=${assignedIds.join(',')}, isCounter=${isCounter}`);
            if (isCounter) {
                counterReservations.push(res);
            } else {
                tableReservations.push(res);
            }
        });

        console.log(`[LaneCalc] Store: ${storeId}, Date: ${date}, Total: ${uniqueReservations.length}, Counter: ${counterReservations.length}, Table: ${tableReservations.length}`);

        // 4. Assign Lanes (Updated for independent tables)
        const updates: Promise<any>[] = [];

        // --- Counter Logic (Global Packing per "Counter Group" implicit assumption) ---
        // For counters, we stick to "Global Packing" for now as they are often treated as one resource pool or grouped physically.
        // Or strictly speaking, we should group by table ID if we want rows to be independent?
        // But counters are special: "Counter A-1" and "Counter A-2" are distinct rows.
        // Yes, they should ALSO be independent! 
        // If I sit at Counter 1, my lane is 0. If you sit at Counter 2, your lane is 0.
        // Current logic packs them: Counter 1 (Lane 0), Counter 2 (Lane 1).
        // This causes the "Staircase" effect on counters too!
        // So actually, the NEW LOGIC applies primarily to ALL tables including counters.
        // However, `CounterLaneGroup` in Frontend groups them and draws them in one block?
        // Let's re-read TimelineView:
        // `CounterLaneGroup` receives `lanes`. It iterates lanes and draws rows.
        // If we change Counter 1 -> Lane 0, Counter 2 -> Lane 0.
        // `CounterLaneGroup` will put both in Lane 0 array.
        // `CounterLaneGroup` renders Lane 0 array in ONE row.
        // Result: Overlap visual (Res 1 on top of Res 2).
        // BAD for Counters if they are handled as a group!
        // 
        // Wait, `CounterLaneGroup` renders reservations relative to the *Group*.
        // If Res A is on Table C1, Res B on Table C2. Both in Group "Counter".
        // They are different PHYSICAL tables.
        // If they are both Lane 0, they draw on top of each other?
        // `CounterLaneGroup` iteration:
        // {lane.map(res => ... div style={{ left, top: laneIndex * height }} ...)}
        // Yes, if both are Lane 0, they draw at same Top.
        // BUT they have different `left` (time).
        // If they overlap in time:
        // Res A (12:00-13:00) Lane 0. Res B (12:00-13:00) Lane 0.
        // They draw on top of each other!
        // SO: For Counters (grouped display), they MUST conflict if times overlap, even if tables differ.
        // BECAUSE they share the same "Row" valid space in the UI (the Group is the Row-set).
        //
        // CONCLUSION:
        // - Standard Tables: Each table has its own row. Logic: Independent.
        // - Counters: Grouped tables share rows. Logic: Global (within group).

        // --- Counter Logic: Keep Global Packing (per group ideally, but global is safe fallback) ---
        const counterLanes: number[] = [];
        for (const res of counterReservations) {
            const startMin = timeToMinutes(res.time);
            const duration = res.duration || 90;
            const endMin = startMin + duration;

            let assignedLane = -1;
            for (let i = 0; i < counterLanes.length; i++) {
                if (counterLanes[i] <= startMin) {
                    assignedLane = i;
                    counterLanes[i] = endMin;
                    break;
                }
            }
            if (assignedLane === -1) {
                assignedLane = counterLanes.length;
                counterLanes.push(endMin);
            }

            if (res.laneIndex !== assignedLane) {
                updates.push(strapi.db.query('api::reservation.reservation').update({
                    where: { documentId: res.documentId },
                    data: { laneIndex: assignedLane },
                    transaction
                } as any));
            }
        }

        // --- Table Logic: Per-Table Independent Packing ---
        // tableId -> [lane0_end, lane1_end...]
        const tableOccupancy = new Map<number, number[]>();

        // Sort table reservations by time (already done via query orderBy, but for safety...)
        // Query ordered by time asc.

        for (const res of tableReservations) {
            const startMin = timeToMinutes(res.time);
            const duration = res.duration || 90;
            const endMin = startMin + duration;
            const resTableIds = res.assignedTables?.map((t: any) => t.id) || [];

            // Find best lane
            let laneCandidate = 0;
            while (true) {
                let isFree = true;
                for (const tid of resTableIds) {
                    const ends = tableOccupancy.get(tid) || [];
                    const occupiedUntil = ends[laneCandidate] || 0;
                    if (occupiedUntil > startMin) {
                        isFree = false;
                        break;
                    }
                }
                if (isFree) break;
                laneCandidate++;
            }

            // Update Occupancy
            for (const tid of resTableIds) {
                const ends = tableOccupancy.get(tid) || [];
                while (ends.length <= laneCandidate) ends.push(0);
                ends[laneCandidate] = endMin;
                tableOccupancy.set(tid, ends);
            }

            // Queue Update
            if (res.laneIndex !== laneCandidate) {
                updates.push(strapi.db.query('api::reservation.reservation').update({
                    where: { documentId: res.documentId },
                    data: { laneIndex: laneCandidate },
                    transaction
                } as any));
            }
        }

        // 7. Execute all updates
        if (updates.length > 0) {
            await Promise.all(updates);
            console.log(`[LaneCalc] Updated ${updates.length} reservations for ${date}`);
        }
    }
}));
