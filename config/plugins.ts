import crypto from 'crypto';

const isDev = process.env.NODE_ENV === 'development';

export default ({ env }) => ({
    upload: {
        config: {
            providerOptions: {
                localServer: {
                    maxage: 300000
                },
            },
            sizeOptimization: !isDev,
            responsiveDimensions: !isDev,
            autoOrientation: false,
            ...(isDev ? { breakpoints: {} } : {}),
        },
    },
    'users-permissions': {
        config: {
            jwtSecret: env('JWT_SECRET') || crypto.randomBytes(16).toString('base64'),
        },
    },
});
