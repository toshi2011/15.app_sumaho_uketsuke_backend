/**
 * 本番環境用ミドルウェア設定
 * INF-303 実装
 */

export default [
    'strapi::logger',
    'strapi::errors',
    {
        name: 'strapi::security',
        config: {
            contentSecurityPolicy: {
                useDefaults: true,
                directives: {
                    'connect-src': ["'self'", 'https:'],
                    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
                    'media-src': ["'self'", 'data:', 'blob:'],
                    upgradeInsecureRequests: null,
                },
            },
            // クリックジャッキング対策
            frameguard: {
                action: 'deny',
            },
            // XSS対策
            xssFilter: true,
            // MIME タイプ スニッフィング対策
            noSniff: true,
            // Referrer Policy
            referrerPolicy: {
                policy: 'strict-origin-when-cross-origin',
            },
            // HSTS (本番環境で有効化)
            hsts: {
                maxAge: 31536000, // 1年
                includeSubDomains: true,
            },
        },
    },
    {
        name: 'strapi::cors',
        config: {
            enabled: true,
            // 本番環境では許可するオリジンを明示的に指定
            origin: process.env.CORS_ORIGINS
                ? process.env.CORS_ORIGINS.split(',')
                : ['https://your-production-domain.com'],
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
            headers: [
                'Content-Type',
                'Authorization',
                'X-Store-ID',
                'X-Session-ID',
                'Origin',
                'Accept',
            ],
            credentials: true,
            maxAge: 86400, // 24時間
        },
    },
    'strapi::poweredBy',
    'strapi::query',
    {
        name: 'strapi::body',
        config: {
            includeUnparsed: true,
            multipart: true,
            jsonLimit: '10mb',
        },
    },
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
];
