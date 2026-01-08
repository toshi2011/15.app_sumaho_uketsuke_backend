const strapi = require('@strapi/strapi');

async function verifyDurationFix() {
    const app = await strapi.createStrapi({ distDir: './dist' }).load();

    try {
        const storeId = 'kbgudc7dpipl79d2focnm09n';
        const date = '2026-01-09';
        const time = '12:00';
        const guests = 4; // Use 4 guests to test if dynamic duration is gone (should stay 60min)

        console.log(`--- Verifying Duration Fix: ${storeId} ---`);
        console.log(`Creating Reservation: ${date} ${time} for ${guests} guests`);

        const reservationController = app.controller('api::reservation.reservation');

        // Mock Context
        const ctx = {
            request: {
                body: {
                    data: {
                        store: storeId,
                        date: date,
                        time: time,
                        guests: guests,
                        name: 'DurationTestUser',
                        email: 'test@example.com',
                        phone: '09012345678',
                        notes: 'Test for Duration Fix'
                    }
                }
            },
            badRequest: (msg, detail) => {
                console.log('BAD REQUEST:', msg, detail);
                return { error: msg, detail };
            },
            send: (data) => data,
            created: (data) => data
        };

        // Spy on super.create (since we can't easily mock the real super call in this script context without full setup)
        // Instead, we will simulate the Logic Step in the controller by running checkAvailability service directly first
        // effectively re-verifying the logic path the controller takes.

        const storeService = app.service('api::store.store');
        const availability = await storeService.checkAvailability(storeId, date, time, guests);

        console.log('Availability Result:', JSON.stringify(availability, null, 2));

        if (availability.available) {
            console.log(`[SUCCESS] Reservation should be accepted.`);
            console.log(`[CHECK] Required Duration: ${availability.requiredDuration}`);

            if (availability.requiredDuration === 60) {
                console.log('[PASS] Duration is 60 min (Store Setting) regardless of 4 guests.');
            } else {
                console.log(`[FAIL] Duration is ${availability.requiredDuration} min. Expected 60.`);
            }

        } else {
            console.log(`[FAIL] Reservation rejected. Reason: ${availability.reason}`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

verifyDurationFix();
