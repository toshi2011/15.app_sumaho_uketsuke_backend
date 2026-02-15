const strapi = require('@strapi/strapi');

async function debugEmail() {
    // Start strapi
    const app = await strapi.createStrapi({ distDir: './dist' }).load();

    try {
        console.log('--- Email Debug Start ---');

        // Find the confirmed reservation
        const reservations = await app.entityService.findMany('api::reservation.reservation', {
            filters: { id: 37 }, // The one we know exists
            populate: ['store'],
        });

        if (!reservations.length) {
            console.error('Reservation 37 not found');
            return;
        }

        const r = reservations[0];
        console.log(`Testing email for Reservation ${r.id} (${r.email})`);

        // Force send email
        const emailService = app.plugin('email').service('email');
        const customEmailService = app.service('api::reservation.email');

        // Check config
        const config = app.config.get('plugin.email');
        console.log('Email Plugin Config:', JSON.stringify(config, null, 2));

        // Try using our custom service
        console.log('Calling sendReservationEmail...');
        const result = await customEmailService.sendReservationEmail(r, r.store, 'confirmed');
        console.log('Result:', result);

    } catch (e) {
        console.error('Debug Error:', e);
    }

    // Allow time for async ops if any (though await should handle it)
    setTimeout(() => process.exit(0), 1000);
}

debugEmail();
