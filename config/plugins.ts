const isDev = process.env.NODE_ENV === 'development';

export default {
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
};
