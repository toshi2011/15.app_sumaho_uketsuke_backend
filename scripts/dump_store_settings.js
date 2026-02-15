const strapi = require('@strapi/strapi');
const fs = require('fs');

async function inspectStore() {
    const app = await strapi.createStrapi({ distDir: './dist' }).load();

    try {
        const storeId = 'kbgudc7dpipl79d2focnm09n';
        const date = '2026-01-09';

        let output = `--- Inspecting Store: ${storeId} for ${date} ---\n`;

        const store = await app.documents('api::store.store').findOne({
            documentId: storeId,
            populate: ['tables']
        });

        output += `Lunch Duration: ${store.lunchDuration} min\n`;
        output += `Dynamic Duration Rate: ${store.dynamicDurationRate} min/person (over 2)\n`;
        output += `Tables:\n${store.tables.map(t => `- ${t.name} (Cap:${t.capacity})`).join('\n')}\n`;

        // Check Reservations
        const reservations = await strapi.entityService.findMany('api::reservation.reservation', {
            filters: {
                date: date,
                status: { $ne: 'cancelled' },
                store: storeId
            },
            populate: ['assignedTables']
        });

        output += `\nExisting Reservations (${reservations.length}):\n`;
        reservations.sort((a, b) => a.time.localeCompare(b.time));
        reservations.forEach(r => {
            const tNames = r.assignedTables ? r.assignedTables.map(t => t.name).join(',') : 'None';
            output += `- ${r.time} ~ ??? (${r.guests}p) ${r.name}: [${tNames}]\n`;
        });

        const storeService = app.service('api::store.store');

        // Check for 3 guests at 13:00 and 13:15
        const checkTimes = ['13:00', '13:15'];
        const g = 3;

        for (const tm of checkTimes) {
            output += `\n--- Checking for ${g} Guests at ${tm} ---\n`;
            const result = await storeService.checkAvailability(storeId, date, tm, g);
            if (result.available) {
                output += `[AVAILABLE] Table: ${result.candidateTable?.name}, Duration: ${result.requiredDuration} min\n`;
            } else {
                output += `[UNAVAILABLE] Reason: ${result.reason}, Duration Required: ${result.requiredDuration} min\n`;
            }
        }

        fs.writeFileSync('temp_settings_dump.txt', output);
        console.log('Dumped to temp_settings_dump.txt');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

inspectStore();
