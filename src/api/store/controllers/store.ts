import { factories } from '@strapi/strapi';
import { StoreConfig } from '../../../core/config/StoreConfig';

export default factories.createCoreController('api::store.store', ({ strapi }) => ({
    async findOne(ctx) {
        const { data, meta } = await super.findOne(ctx);
        if (data) {
            const attrs = data.attributes || data;
            // Calculate source info
            const config = StoreConfig.resolve(attrs);
            // Attach source to meta or attributes? 
            // Attaching to meta is cleaner for "metadata"
            meta.configSource = (config as any).source;
            // Also attach specific duration sources if needed
        }
        return { data, meta };
    },

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
