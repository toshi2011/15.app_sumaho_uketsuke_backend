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

        // 4. Helper function for lane assignment
        const assignLanes = (resGroup: typeof reservations): Map<string, number> => {
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

        // 5. Calculate lanes separately for counter and table reservations
        const counterLanes = assignLanes(counterReservations);
        const tableLanes = assignLanes(tableReservations);

        // 6. Prepare updates
        const updates = [];

        for (const [docId, lane] of counterLanes) {
            const res = counterReservations.find((r: any) => r.documentId === docId);
            if (res && res.laneIndex !== lane) {
                updates.push(
                    strapi.db.query('api::reservation.reservation').update({
                        where: { documentId: docId },
                        data: { laneIndex: lane },
                        transaction
                    } as any)
                );
            }
        }

        for (const [docId, lane] of tableLanes) {
            const res = tableReservations.find((r: any) => r.documentId === docId);
            if (res && res.laneIndex !== lane) {
                updates.push(
                    strapi.db.query('api::reservation.reservation').update({
                        where: { documentId: docId },
                        data: { laneIndex: lane },
                        transaction
                    } as any)
                );
            }
        }

        // 7. Execute all updates
        if (updates.length > 0) {
            await Promise.all(updates);
            console.log(`[LaneCalc] Updated ${updates.length} reservations for ${date}`);
        }
    }
}));
