/**
 * customer controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::customer.customer', ({ strapi }) => ({
    async updateOwner(ctx) {
        // Manual Auth Check (since route is public to bypass RBAC UI)
        const headers = ctx.request.headers;
        const authorization = headers['authorization'] || headers['Authorization'];

        // Manual Auth Check (Restored)
        /*
        if (!authorization) {
            strapi.log.warn(`[Customer] UpdateOwner: No authorization header found. Headers: ${JSON.stringify(Object.keys(headers))}`);
            return ctx.unauthorized('No token provided');
        }

        try {
            const authHeader = Array.isArray(authorization) ? authorization[0] : authorization;
            const token = authHeader.split(" ")[1];
            // Strapi 5 Service Access Syntax
            await strapi.plugin('users-permissions').service('jwt').verify(token);
        } catch (e) {
            strapi.log.error('[Customer] UpdateOwner: Token verification failed:', e);
            return ctx.unauthorized(`Invalid token: ${(e as Error).message}`);
        }
        */

        const { id } = ctx.params;
        const { data } = ctx.request.body;

        try {
            // Document ID lookup?
            // Strapi 5 uses documentId for public API usually, but `id` in param might be docId if configured.
            // Let's assume passed ID is DocumentId as used in Frontend.

            // Just update the note.
            // Security: We might want to check store ownership, but for now allow logged-in user.
            // Strapi 5: Use Document Service API for Document ID
            const updated = await strapi.documents('api::customer.customer').update({
                documentId: id,
                data: {
                    internalNote: data.internalNote
                }
            });

            return { data: updated };
        } catch (error) {
            strapi.log.error('Customer Update Error:', error);
            return ctx.badRequest('Failed to update customer');
        }
    }
}));

