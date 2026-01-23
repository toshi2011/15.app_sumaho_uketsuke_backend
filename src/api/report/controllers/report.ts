export default ({ strapi }) => ({
  async generateWeekly(ctx) {
    const { storeId } = ctx.query;
    if (!storeId) return ctx.badRequest('storeId is required');

    try {
      const report = await strapi.service('api::report.report').generateWeeklyReport(storeId);
      ctx.body = { report };
    } catch (err) {
      strapi.log.error('Report Generation Error:', err);
      ctx.internalServerError('Failed to generate report');
    }
  }
});
