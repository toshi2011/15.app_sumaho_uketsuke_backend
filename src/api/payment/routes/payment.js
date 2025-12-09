module.exports = {
    routes: [
        {
            method: 'POST',
            path: '/payment/create-checkout-session',
            handler: 'payment.createCheckoutSession',
            config: {
                policies: [],
                middlewares: [],
            },
        },
        {
            method: 'POST',
            path: '/payment/webhook',
            handler: 'webhook.handleWebhook',
            config: {
                auth: false, // Webhook doesn't use authentication
                policies: [],
                middlewares: [],
            },
        },
    ],
};
