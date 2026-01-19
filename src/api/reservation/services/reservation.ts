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
        // 1. Fetch all active reservations for the day, sorted by start time
        // Note: We use strapi.db.query to support transaction and granular control
        const reservations = await strapi.db.query('api::reservation.reservation').findMany({
            where: {
                store: storeId, // Works for both ID and DocumentID in Strapi 5 usually, but preferably DocumentID
                date: date,
                status: { $ne: 'canceled' }
            },
            orderBy: { time: 'asc' }, // Sort by start time strictly
            populate: ['store'], // Ensure we might need config if re-calc duration? No, just lane here.
        });

        if (!reservations || reservations.length === 0) return;

        // 2. Greedy Algorithm for Lane Assignment
        // lanes[i] holds the end time (in minutes) of the last reservation in lane i
        const lanes: number[] = [];

        // Prepare updates
        const updates = [];

        for (const res of reservations) {
            const startMin = timeToMinutes(res.time);
            // duration and endTime should already be set by Controller, but be safe
            // If missing, we might default, but Ticket 02 ensures they are present.
            // We'll use stored endTime or calculate from duration.
            // Let's rely on duration for simplicity of logic here, specifically 'end minute'.

            let duration = res.duration || 90;
            // If isOvernight, duration logic might separate, but for 'lane blocking',
            // we cares about absolute minutes from start of the day (00:00).
            // If start is 23:00 (1380) and duration 120, end is 1500 (25:00).

            // Adjust start for overnight sorting if needed? 
            // Actually, we assumed sorted by 'time' string ("00:00" to "23:59").
            // If we have late night reservations (e.g. 26:00 represented as 02:00 next day?),
            // usually they belong to the 'logical' date.
            // If 'time' allows "26:00", that's fine. If "02:00", it might sort earlier.
            // Assumption: 'date' represents the business day, and 'time' flows logically.
            // If 'time' wraps (02:00 stored for next day), that reservation belongs to THAT date?
            // User requirement says "Sort DB by start time".
            // Let's assume 'time' is consistent 00:00-23:59.
            // If valid reservation is 25:00, it's usually stored as 01:00 NEXT day?
            // "日付を跨ぐ予約には isOvernight ... フロントエンドでの描画ミスを防ぐ"
            // For lane logic, we just need checking overlaps.

            let endMin = startMin + duration;

            let assignedLane = -1;

            // Find first lane that is free (Lane End Time <= Current Start Time)
            for (let i = 0; i < lanes.length; i++) {
                if (lanes[i] <= startMin) {
                    assignedLane = i;
                    lanes[i] = endMin; // Extend this lane
                    break;
                }
            }

            // If no suitable lane found, create new one
            if (assignedLane === -1) {
                assignedLane = lanes.length;
                lanes.push(endMin);
            }

            // Determine if update is needed
            if (res.laneIndex !== assignedLane) {
                // Add to update promise list
                updates.push(
                    strapi.db.query('api::reservation.reservation').update({
                        where: { documentId: res.documentId }, // Strapi 5 prefers documentId
                        data: { laneIndex: assignedLane },
                        transaction // Pass the transaction!
                    } as any)
                );
            }
        }

        // 3. Execute all updates
        if (updates.length > 0) {
            await Promise.all(updates);
            // strapi.log.debug(`[ReservationService] Recalculated lanes for ${date}: ${updates.length} updates.`);
        }
    }
}));
