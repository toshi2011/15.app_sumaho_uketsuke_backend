'use strict';

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = {
    async createCheckoutSession(ctx) {
        try {
            const { storeId, planType } = ctx.request.body;

            if (!storeId || !planType) {
                return ctx.badRequest('storeId and planType are required');
            }

            // Verify store exists
            const store = await strapi.entityService.findOne('api::store.store', storeId);
            if (!store) {
                return ctx.notFound('Store not found');
            }

            // Define price IDs for different plans
            // TODO: Replace with actual Stripe Price IDs from your Stripe Dashboard
            const priceIds = {
                'basic': process.env.STRIPE_PRICE_BASIC || 'price_basic_placeholder',
                'micro-hp': process.env.STRIPE_PRICE_MICRO_HP || 'price_micro_hp_placeholder',
            };

            const priceId = priceIds[planType];
            if (!priceId) {
                return ctx.badRequest('Invalid planType');
            }

            // Create Stripe Checkout Session
            const session = await stripe.checkout.sessions.create({
                mode: 'subscription',
                payment_method_types: ['card'],
                line_items: [
                    {
                        price: priceId,
                        quantity: 1,
                    },
                ],
                success_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/dashboard?payment=success`,
                cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/dashboard?payment=canceled`,
                client_reference_id: storeId, // Crucial for webhook
                metadata: {
                    storeId: storeId,
                    planType: planType,
                },
            });

            ctx.send({
                url: session.url,
                sessionId: session.id,
            });
        } catch (error) {
            strapi.log.error('Stripe checkout session creation failed:', error);
            ctx.internalServerError('Failed to create checkout session');
        }
    },
};
