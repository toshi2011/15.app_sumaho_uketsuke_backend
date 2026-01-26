/**
 * 翻訳APIルート定義
 * Ticket-03: AI翻訳返信フロー
 */

export default {
    routes: [
        {
            method: 'POST',
            path: '/translate',
            handler: 'translate.translate',
            config: {
                // 認証不要（管理画面からの呼び出し時はCookieで認証済み）
                auth: false,
            },
        },
    ],
};
