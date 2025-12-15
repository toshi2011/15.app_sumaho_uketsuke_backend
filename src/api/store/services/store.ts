import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::store.store', ({ strapi }) => ({
    async checkAvailability(storeId, date, time, guests) {
        try {
            // 1. Fetch store settings by documentId using db.query
            const store = await strapi.db.query('api::store.store').findOne({
                where: { documentId: storeId },
            });

            if (!store) {
                return { available: false, capacityUsed: 0, reason: 'Store not found' };
            }

            // Fetch store's active tables to calculate total capacity
            const tables = await strapi.db.query('api::table.table').findMany({
                where: {
                    store: store.id,
                    isActive: true,
                },
            });

            // Calculate total capacity from tables (using maxCapacity if available, otherwise capacity)
            let totalMaxCapacity = 0;
            if (tables.length > 0) {
                totalMaxCapacity = tables.reduce((sum: number, table: any) => {
                    // 最大許容人数 > 定員 > 0 の順で使用
                    const tableMax = table.maxCapacity || table.capacity || 0;
                    return sum + tableMax;
                }, 0);
            }

            // Use table-based capacity if available, otherwise fall back to store setting
            const maxCapacity = totalMaxCapacity > 0 ? totalMaxCapacity : (store.maxCapacity || 20);
            const maxGroupsPerSlot = store.maxGroupsPerSlot || 5;

            // 時間帯によって滞在時間を切り替え
            const lunchEndTime = store.lunchEndTime || '14:00';
            const lunchDuration = store.lunchDuration || 60;
            const dinnerDuration = store.dinnerDuration || store.defaultDuration || 90;

            // 予約時刻がランチタイムかどうかを判定
            const isLunchTime = time < lunchEndTime;
            const duration = isLunchTime ? lunchDuration : dinnerDuration;

            strapi.log.info(`[checkAvailability] Store: ${store.name}, tables: ${tables.length}, maxCapacity: ${maxCapacity} (from ${totalMaxCapacity > 0 ? 'tables' : 'store'}), maxGroupsPerSlot: ${maxGroupsPerSlot}, duration: ${duration}min (${isLunchTime ? 'lunch' : 'dinner'})`);

            // 2. Parse target time into a Date object
            const targetDateTime = new Date(`${date}T${time}:00`);
            if (isNaN(targetDateTime.getTime())) {
                return { available: false, capacityUsed: 0, reason: 'Invalid date or time' };
            }
            const targetEndTime = new Date(targetDateTime.getTime() + duration * 60 * 1000);

            // 3. Query all active reservations for this store and date
            const allReservations = await strapi.db.query('api::reservation.reservation').findMany({
                where: {
                    date: date,
                    store: store.id,
                    status: { $notIn: ['cancelled', 'rejected'] },
                },
            });

            strapi.log.info(`[checkAvailability] Found ${allReservations.length} active reservations for ${date}`);

            // 4. Filter reservations that overlap with the target time slot
            // Overlap occurs when: existing start < new end AND existing end > new start
            const overlappingReservations = allReservations.filter((reservation: any) => {
                const resTime = reservation.time;
                const resDateTime = new Date(`${date}T${resTime}:00`);

                if (isNaN(resDateTime.getTime())) {
                    return false;
                }

                // 既存予約の滞在時間も時間帯によって切り替え
                const resIsLunchTime = resTime < lunchEndTime;
                const resDuration = reservation.duration || (resIsLunchTime ? lunchDuration : dinnerDuration);
                const resEndTime = new Date(resDateTime.getTime() + resDuration * 60 * 1000);

                // Two time periods overlap if: start1 < end2 AND end1 > start2
                const overlaps = resDateTime < targetEndTime && resEndTime > targetDateTime;

                if (overlaps) {
                    strapi.log.info(`[checkAvailability] Overlap: existing ${resTime}-${resEndTime.toTimeString().slice(0, 5)} (${reservation.guests}人) overlaps with new ${time}-${targetEndTime.toTimeString().slice(0, 5)}`);
                }

                return overlaps;
            });

            // 5. Calculate current capacity usage
            const currentGuests = overlappingReservations.reduce(
                (sum: number, res: any) => sum + (res.guests || 0),
                0
            );
            const currentGroups = overlappingReservations.length;

            strapi.log.info(`[checkAvailability] Current: ${currentGuests} guests, ${currentGroups} groups. New request: ${guests} guests`);

            // 6. Check if adding new reservation would exceed limits
            const newTotalGuests = currentGuests + guests;
            const newTotalGroups = currentGroups + 1;

            const guestsExceeded = newTotalGuests > maxCapacity;
            const groupsExceeded = newTotalGroups > maxGroupsPerSlot;

            // 7. Calculate capacity utilization percentage
            const capacityUsed = Math.round((currentGuests / maxCapacity) * 100);

            strapi.log.info(`[checkAvailability] Result: newTotalGuests=${newTotalGuests}/${maxCapacity}, newTotalGroups=${newTotalGroups}/${maxGroupsPerSlot}, guestsExceeded=${guestsExceeded}, groupsExceeded=${groupsExceeded}`);

            // 8. Return availability status
            if (guestsExceeded || groupsExceeded) {
                const reason = guestsExceeded
                    ? `Maximum capacity (${maxCapacity} guests) would be exceeded`
                    : `Maximum groups per slot (${maxGroupsPerSlot}) would be exceeded`;
                return { available: false, capacityUsed: 100, reason };
            }

            return { available: true, capacityUsed };
        } catch (error) {
            strapi.log.error('Error in checkAvailability:', error);
            return { available: true, capacityUsed: 0 }; // Fail open
        }
    },
}));
