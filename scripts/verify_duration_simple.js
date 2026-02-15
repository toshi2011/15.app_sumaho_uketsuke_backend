const strapi = require('@strapi/strapi');

async function verifySimple() {
    const app = await strapi.createStrapi({ distDir: './dist' }).load();

    try {
        const storeId = 'kbgudc7dpipl79d2focnm09n';
        const date = '2026-01-09';
        const time = '12:00';
        const guests = 4;

        console.log(`Checking Availability for ${guests} guests at ${time}...`);

        const storeService = app.service('api::store.store');
        const result = await storeService.checkAvailability(storeId, date, time, guests);

        console.log('Available:', result.available);
        console.log('Required Duration:', result.requiredDuration);

        if (result.requiredDuration <= 90) {
            console.log('PASS: Duration is standard (not dynamically increased).');
        } else {
            console.log('FAIL: Duration is > 90 min.');
        }

    } catch (error) {
        console.error(error);
    } finally {
        process.exit(0);
    }
}

verifySimple();
