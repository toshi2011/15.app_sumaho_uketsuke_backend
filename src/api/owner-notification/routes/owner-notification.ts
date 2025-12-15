/**
 * カスタムルート: 店主通知API
 */

export default {
    routes: [
        {
            method: 'GET',
            path: '/owner/notifications/check',
            handler: 'owner-notification.check',
            config: {
                policies: [],
                middlewares: [],
                description: '新規予約チェック（ポーリング用）',
            },
        },
        {
            method: 'POST',
            path: '/owner/notifications/mark-read',
            handler: 'owner-notification.markRead',
            config: {
                policies: [],
                middlewares: [],
                description: '予約を既読にする',
            },
        },
        {
            method: 'POST',
            path: '/owner/session/start',
            handler: 'owner-notification.sessionStart',
            config: {
                policies: [],
                middlewares: [],
                description: 'セッション開始（サウンド再生可能化）',
            },
        },
        {
            method: 'POST',
            path: '/owner/session/end',
            handler: 'owner-notification.sessionEnd',
            config: {
                policies: [],
                middlewares: [],
                description: 'セッション終了',
            },
        },
    ],
};
