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
    ],
};

// Force reload timestamp: 2026-01-08-16-15
