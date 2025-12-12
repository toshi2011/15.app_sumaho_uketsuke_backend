/**
 * 公開予約API用ルート
 * BE-103 実装
 */

export default {
    routes: [
        {
            method: 'POST',
            path: '/public/reservations',
            handler: 'public-reservation.create',
            config: {
                auth: false, // 公開API
                policies: [],
                middlewares: [],
                description: '予約作成（リードタイム検証あり）',
            },
        },
        {
            method: 'GET',
            path: '/public/reservations/:reservationNumber',
            handler: 'public-reservation.findByNumber',
            config: {
                auth: false,
                policies: [],
                middlewares: [],
                description: '予約番号で予約を取得',
            },
        },
    ],
};
