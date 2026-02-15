export default {
    routes: [
        {
            method: 'GET',
            path: '/stores/:id/check-availability',
            handler: 'store.checkAvailability',
            config: {
                auth: false,
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'GET',
            path: '/stores/:id/available-slots',
            handler: 'store.getAvailableSlots',
            config: {
                auth: false,
                policies: [],
                middlewares: [],
            },
        },
    ],
};

// Force reload timestamp: 2026-01-21-18-30
