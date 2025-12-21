const strapi = require('@strapi/strapi');

async function check() {
    const app = await strapi().load();
    const stores = await app.entityService.findMany('api::store.store', {
        populate: ['tables']
    });

    console.log('--- TABLE COUNT REPORT ---');
    for (const store of stores) {
        const tableCount = store.tables ? store.tables.length : 0;
        const tableNames = store.tables ? store.tables.map(t => t.name).join(', ') : '';
        console.log(`Store ID ${store.id} (${store.name}): ${tableCount} tables. [${tableNames}]`);
    }
    process.exit(0);
}

check();
