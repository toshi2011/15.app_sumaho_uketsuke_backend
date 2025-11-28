export default {
    routes: [
        {
            method: 'GET',
            path: '/stores/:id/check-availability',
            handler: 'store.checkAvailability',
            config: {
                policies: [],
                middlewares: [],
            },
        },
    ],
};
