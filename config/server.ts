/**
 * 本番環境用サーバー設定
 * INF-303 実装
 */

export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('PUBLIC_URL', 'https://api.your-domain.com'),
  proxy: env.bool('PROXY', true),
  app: {
    keys: env.array('APP_KEYS', ['fallback_keyA', 'fallback_keyB', 'fallback_keyC', 'fallback_keyD']),
  },
});