'use strict';

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = {
    async handleWebhook(ctx) {
        const sig = ctx.request.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret) {
            strapi.log.error('STRIPE_WEBHOOK_SECRET is not configured');
            return ctx.internalServerError('Webhook secret not configured');
        }

        let event;

        try {
            // Verify webhook signature
            // Note: ctx.request.body should be raw buffer for signature verification
            event = stripe.webhooks.constructEvent(
                ctx.request.body[Symbol.for('unparsedBody')] || ctx.request.body,
                sig,
                webhookSecret
            );
        } catch (err) {
            strapi.log.error('Webhook signature verification failed:', err.message);
            return ctx.badRequest(`Webhook Error: ${err.message}`);
        }

        // Handle the event
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;

                try {
                    // Extract store ID from client_reference_id
                    const storeId = session.client_reference_id;

                    if (!storeId) {
                        strapi.log.error('No storeId found in checkout session');
                        break;
                    }

                    // Get subscription ID
                    const subscriptionId = session.subscription;

                    // Update store status to ACTIVE
                    await strapi.entityService.update('api::store.store', storeId, {
                        data: {
                            status: 'ACTIVE',
                            subscriptionId: subscriptionId,
                            subscriptionStatus: 'active',
                            planType: session.metadata?.planType || null,
                        },
                    });

                    strapi.log.info(`Store ${storeId} activated with subscription ${subscriptionId}`);
                } catch (error) {
                    strapi.log.error('Failed to update store after checkout:', error);
                }
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;

                try {
                    // Find store by subscription ID
                    const stores = await strapi.entityService.findMany('api::store.store', {
                        filters: { subscriptionId: subscription.id },
                        limit: 1,
                    });

                    if (stores.length > 0) {
                        const store = stores[0];
                        await strapi.entityService.update('api::store.store', store.id, {
                            data: {
                                subscriptionStatus: subscription.status,
                            },
                        });
                        strapi.log.info(`Store ${store.id} subscription status updated to ${subscription.status}`);
                    }
                } catch (error) {
                    strapi.log.error('Failed to update subscription status:', error);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;

                try {
                    // Find store by subscription ID
                    const stores = await strapi.entityService.findMany('api::store.store', {
                        filters: { subscriptionId: subscription.id },
                        limit: 1,
                    });

                    if (stores.length > 0) {
                        const store = stores[0];
                        await strapi.entityService.update('api::store.store', store.id, {
                            data: {
                                status: 'TRIAL', // Or 'DORMANT' depending on business logic
                                subscriptionStatus: 'canceled',
                            },
                        });
                        strapi.log.info(`Store ${store.id} subscription canceled`);
                    }
                } catch (error) {
                    strapi.log.error('Failed to handle subscription deletion:', error);
                }
                break;
            }

            default:
                strapi.log.info(`Unhandled event type: ${event.type}`);
        }

        // Return 200 to acknowledge receipt
        ctx.send({ received: true });
    },
};
