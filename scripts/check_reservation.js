
const { createStrapi } = require('@strapi/strapi');

async function check() {
    try {
        const strapi = await createStrapi().load();

        const reservations = await strapi.db.query('api::reservation.reservation').findMany({
            where: {
                date: '2025-12-25',
            },
            populate: ['store'],
        });

        console.log('Reservations for 2025-12-25:');
        console.log(JSON.stringify(reservations, null, 2));

    } catch (error) {
        console.error('Script Error:', error);
    }

    process.exit(0);
}

check();
