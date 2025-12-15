/**
 * メールテスト用ルート
 * INF-302 実装
 */

export default {
    routes: [
        {
            method: 'GET',
            path: '/test/email/preview/:template',
            handler: 'email-test.preview',
            config: {
                auth: false, // 認証なしでアクセス可能
                policies: [],
                middlewares: [],
                description: 'メールテンプレートプレビュー（HTML）',
            },
        },
        {
            method: 'POST',
            path: '/test/email/send',
            handler: 'email-test.send',
            config: {
                auth: false, // 認証なしでアクセス可能
                policies: [],
                middlewares: [],
                description: 'テストメール送信',
            },
        },
    ],
};
