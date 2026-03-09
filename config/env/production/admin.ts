export default ({ env }) => ({
    auth: {
        secret: env('ADMIN_JWT_SECRET', 'fallback_admin_jwt_secret_render_fix'),
    },
    apiToken: {
        salt: env('API_TOKEN_SALT', 'fallback_api_token_salt_render_fix'),
    },
    transfer: {
        token: {
            salt: env('TRANSFER_TOKEN_SALT', 'fallback_transfer_token_salt_render_fix'),
        },
    },
    secrets: {
        encryptionKey: env('ENCRYPTION_KEY', 'fallback_encryption_key_render_fix'),
    },
});
