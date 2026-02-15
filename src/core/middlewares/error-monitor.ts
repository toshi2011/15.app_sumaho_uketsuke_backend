/**
 * エラー監視ミドルウェア
 * INF-303 実装: メール送信失敗等のエラーを記録・通知
 */

export default (config, { strapi }) => {
    return async (ctx, next) => {
        try {
            await next();
        } catch (error: any) {
            // エラーをログに記録
            strapi.log.error('Request error:', {
                path: ctx.request.path,
                method: ctx.request.method,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString(),
            });

            // 重大なエラーの場合はアラート
            if (isCriticalError(error)) {
                await sendErrorAlert(strapi, error, ctx);
            }

            throw error;
        }
    };
};

/**
 * 重大なエラーかどうかを判定
 */
function isCriticalError(error: any): boolean {
    const criticalPatterns = [
        'ECONNREFUSED', // DB接続エラー
        'SMTP',         // メール送信エラー
        'SES',          // AWS SES エラー
        'authentication', // 認証エラー
    ];

    const message = error.message || '';
    return criticalPatterns.some(pattern =>
        message.toLowerCase().includes(pattern.toLowerCase())
    );
}

/**
 * エラーアラートを送信
 */
async function sendErrorAlert(strapi: any, error: any, ctx: any) {
    const alertConfig = {
        path: ctx.request.path,
        method: ctx.request.method,
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'),
        timestamp: new Date().toISOString(),
        storeId: ctx.request.header['x-store-id'] || 'unknown',
    };

    // ログに詳細を記録（本番環境ではSlack/Discord webhook等に送信可能）
    strapi.log.error('🚨 CRITICAL ERROR ALERT:', JSON.stringify(alertConfig, null, 2));

    // WebhookがセットされてÂいる場合は通知
    const webhookUrl = process.env.ERROR_WEBHOOK_URL;
    if (webhookUrl) {
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `🚨 Critical Error: ${error.message}`,
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `*Error:* ${error.message}\n*Path:* ${alertConfig.path}\n*Time:* ${alertConfig.timestamp}`,
                            },
                        },
                    ],
                }),
            });
        } catch (webhookError) {
            strapi.log.error('Failed to send webhook alert:', webhookError);
        }
    }
}
