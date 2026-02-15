
const Strapi = require('@strapi/strapi');

async function debugConflict() {
    const strapi = await Strapi.createStrapi({ distDir: './dist' }).load();

    try {
        const reservationId = 'x641k2lvfjyioq3lx6yt8z1s'; // From logs (ID 73)
        const storeId = 'yxezke33o8wm6q2zq1zrna7d'; // From logs
        const targetTableId = 77; // Table 2 (From logs)
        const checkDate = '2026-01-08';

        console.log('--- Debugging Conflict Logic ---');
        console.log(`Reservation: ${reservationId} (Targeting Date: ${checkDate})`);
        console.log(`Target Table: ${targetTableId}`);

        // 1. Get current reservation
        const reservation = await strapi.db.query('api::reservation.reservation').findOne({
            where: { documentId: reservationId },
            populate: ['assignedTables', 'store']
        });

        if (!reservation) {
            console.error('Reservation not found');
            return;
        }

        console.log(`Current Reservation: ${reservation.date} ${reservation.time}, Tables: ${reservation.assignedTables.map(t => t.id).join(',')}`);

        // 2. Run conflict query
        const queryWhere = {
            store: { id: reservation.store.id },
            date: checkDate,
            // id: { $ne: reservation.id },
            // status: { $notIn: ['cancelled', 'no_show', 'completed'] },
            assignedTables: {
                id: { $in: [targetTableId] }
            }
        };

        console.log('Query Where:', JSON.stringify(queryWhere, null, 2));

        const conflicts = await strapi.db.query('api::reservation.reservation').findMany({
            where: queryWhere,
            populate: ['assignedTables']
        });

        console.log(`Found ${conflicts.length} conflicting candidates via DB Query.`);
        conflicts.forEach(c => {
            console.log(` - [${c.id}] ${c.time} (Duration: ${c.duration || '?'}), Tables: ${c.assignedTables.map(t => t.id).join(',')}`);
        });

        // 3. JS Filter Check
        // const { timeToMinutes } = require('./src/utils/timeUtils'); 
        const timeToMinutes = (timeStr) => {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const newTime = reservation.time; // Assuming no change
        const startMin = timeToMinutes(newTime);
        const duration = 90; // Mock
        const endMin = startMin + duration;

        console.log(`Check Time: ${newTime} (${startMin} - ${endMin})`);

        const realConflicts = conflicts.filter(res => {
            const resStart = timeToMinutes(res.time);
            const resEnd = resStart + (res.duration || 90);
            return (startMin < resEnd) && (resStart < endMin);
        });

        console.log(`Real Conflicts (Time Overlap): ${realConflicts.length}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        strapi.stop();
    }
}

debugConflict();
