import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::store.store', ({ strapi }) => ({
    async checkAvailability(storeId, date, time, guests) {
        try {
            // 1. Fetch store settings
            const store = await strapi.entityService.findOne('api::store.store', storeId);

            if (!store) {
                return { available: false, capacityUsed: 0, reason: 'Store not found' };
            }

            const maxCapacity = store.maxCapacity || 20;
            const maxGroupsPerSlot = store.maxGroupsPerSlot || 5;
            const defaultDuration = store.defaultDuration || 90;

            // 2. Parse target time into a Date object
            const targetDateTime = new Date(`${date}T${time}:00`);
            if (isNaN(targetDateTime.getTime())) {
                return { available: false, capacityUsed: 0, reason: 'Invalid date or time' };
            }

            // 3. Query all reservations for this date
            const allReservations = await strapi.entityService.findMany('api::reservation.reservation', {
                filters: {
                    date: date,
                },
            });

            // 4. Filter reservations that overlap with the target 30-minute slot
            const overlappingReservations = allReservations.filter((reservation) => {
                const resTime = reservation.time;
                const resDateTime = new Date(`${date}T${resTime}:00`);

                if (isNaN(resDateTime.getTime())) {
                    return false;
                }

                const resEndTime = new Date(resDateTime.getTime() + defaultDuration * 60 * 1000);

                // Check if target slot falls within this reservation's duration
                return resDateTime <= targetDateTime && targetDateTime < resEndTime;
            });

            // 5. Calculate current capacity usage
            const currentGuests = overlappingReservations.reduce(
                (sum, res) => sum + (res.guests || 0),
                0
            );
            const currentGroups = overlappingReservations.length;

            // 6. Check if adding new reservation would exceed limits
            const newTotalGuests = currentGuests + guests;
            const newTotalGroups = currentGroups + 1;

            const guestsExceeded = newTotalGuests > maxCapacity;
            const groupsExceeded = newTotalGroups > maxGroupsPerSlot;

            // 7. Calculate capacity utilization percentage
            const capacityUsed = Math.round((currentGuests / maxCapacity) * 100);

            // 8. Return availability status
            if (guestsExceeded || groupsExceeded) {
                const reason = guestsExceeded
                    ? `Maximum capacity (${maxCapacity} guests) would be exceeded`
                    : `Maximum groups per slot (${maxGroupsPerSlot}) would be exceeded`;
                return { available: false, capacityUsed: 100, reason };
            }

            return { available: true, capacityUsed };
        } catch (error) {
            console.error('Error in checkAvailability:', error);
            return { available: true, capacityUsed: 0 }; // Fail open
        }
    },
}));
