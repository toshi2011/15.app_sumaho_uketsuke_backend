const { createStrapi } = require('@strapi/strapi');

async function checkDurations() {
    const strapi = await createStrapi({ distDir: './dist' }).load();
    const storeId = 'kbgudc7dpipl79d2focnm09n'; // Local store

    // Fetch reservations
    const reservations = await strapi.entityService.findMany('api::reservation.reservation', {
        filters: { store: { documentId: storeId } },
        sort: { date: 'desc' },
        limit: 10
    });

    console.log("Checking last 10 reservations for duration...");
    reservations.forEach(r => {
        console.log(`[${r.id}] ${r.date} ${r.time} - Duration: ${r.duration} (${typeof r.duration})`);
    });

    process.exit(0);
}

checkDurations();
