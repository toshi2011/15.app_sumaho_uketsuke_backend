export default {
    routes: [
        {
            method: 'GET',
            path: '/reservations/cancel-info/:token',
            handler: 'reservation.getReservationByToken',
            config: {
                auth: false,
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'POST',
            path: '/reservations/cancel',
            handler: 'reservation.execCancel',
            config: {
                auth: false,
                policies: [],
                middlewares: [],
            },
        },
    ],
};
