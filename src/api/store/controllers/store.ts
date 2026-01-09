import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::store.store', ({ strapi }) => ({
    async checkAvailability(ctx) {
        const { id } = ctx.params;
        const { date, time, guests } = ctx.query;

        if (!date || !time || !guests) {
            return ctx.badRequest('Missing required parameters: date, time, guests');
        }

        try {
            const result = await strapi.service('api::store.store').checkAvailability(
                id,
                date,
                time,
                parseInt(String(guests), 10)
            );

            return result;
        } catch (error) {
            console.error('Error in checkAvailability controller:', error);
            ctx.throw(500, error);
        }
    },


}));
