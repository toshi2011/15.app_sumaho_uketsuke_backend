/**
 * カスタムルート: 店主予約管理API
 * BE-102 実装
 */

export default {
    routes: [
        {
            method: 'GET',
            path: '/owner/reservations',
            handler: 'owner-reservation.list',
            config: {
                policies: [],
                middlewares: [],
                description: '予約一覧取得（フィルタ対応）',
            },
        },
        {
            method: 'GET',
            path: '/owner/reservations/:id',
            handler: 'owner-reservation.findOne',
            config: {
                policies: [],
                middlewares: [],
                description: '予約詳細取得',
            },
        },
        {
            method: 'PUT',
            path: '/owner/reservations/:id/status',
            handler: 'owner-reservation.updateStatus',
            config: {
                policies: [],
                middlewares: [],
                description: 'ステータス更新（メール送信トリガー）',
            },
        },
        {
            method: 'PUT',
            path: '/owner/reservations/:id',
            handler: 'owner-reservation.update',
            config: {
                policies: [],
                middlewares: [],
                description: '予約更新（時間・座席・スワップ）',
            },
        },
        {
            method: 'POST',
            path: '/owner/reservations/:id/checkout',
            handler: 'owner-reservation.checkout',
            config: {
                policies: [],
                middlewares: [],
                description: '早期退店（完了ステータスへ変更・時間短縮）',
            },
        },
        {
            method: 'POST',
            path: '/owner/reservations/fix-counters',
            handler: 'owner-reservation.fixCounters',
            config: {
                policies: [],
                middlewares: [],
                description: 'Migration: Fix Counters',
            },
        },
    ],
};
