const strapi = require('@strapi/strapi');
const fs = require('fs');

async function diagnose() {
    const app = await strapi.createStrapi({ distDir: './dist' }).load();
    let output = '';

    try {
        const storeId = 'kbgudc7dpipl79d2focnm09n';
        const date = '2026-01-09';

        output += `--- Diagnosis for ${date} ---\n`;

        // 1. List Reservations
        const reservations = await strapi.entityService.findMany('api::reservation.reservation', {
            filters: {
                date: date,
                status: { $ne: 'canceled' },
                store: storeId
            },
            populate: ['assignedTables']
        });

        output += `Existing Reservations (${reservations.length}):\n`;
        reservations.sort((a, b) => a.time.localeCompare(b.time));

        reservations.forEach(r => {
            const tables = r.assignedTables ? r.assignedTables.map(t => `${t.name}(Cap:${t.capacity})`).join(', ') : 'None';
            output += `- [${r.id}] ${r.time} (${r.guests}p) Duration:${r.duration || 'N/A'} min. Tables: [${tables}]\n`;
        });

        // 2. Check 13:00 vs 13:15 for 3 guests
        const storeService = app.service('api::store.store');

        for (const tm of ['13:00', '13:15']) {
            output += `\n--- Check 3 Guests at ${tm} ---\n`;
            try {
                const res = await storeService.checkAvailability(storeId, date, tm, 3);
                output += `Result: ${res.available ? 'AVAILABLE' : 'REJECTED'}\n`;
                if (!res.available) output += `Reason: ${res.reason}\n`;
                if (res.available) output += `Assigned: ${res.candidateTable?.name}\n`;
                if (res.requiredDuration) output += `Duration: ${res.requiredDuration}\n`;
            } catch (err) {
                output += `Error checking ${tm}: ${err.message}\n`;
            }
        }

    } catch (e) {
        output += `Critical Error: ${e.message}\n`;
    } finally {
        fs.writeFileSync('diagnosis_result.txt', output);
        console.log('Diagnosis written to diagnosis_result.txt');
        process.exit(0);
    }
}

diagnose();
