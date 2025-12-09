const { createStrapi } = require('@strapi/strapi');

async function verifyData() {
    const strapi = createStrapi({ distDir: './dist' });
    await strapi.load();

    const stores = await strapi.db.query('api::store.store').findMany({
        populate: ['ownerInfo']
    });

    const users = await strapi.db.query('plugin::users-permissions.user').findMany({
        where: { email: { $contains: 'test' } }
    });

    console.log(`Found ${stores.length} stores and ${users.length} test users in DB.`);

    console.log('--- Stores ---');
    stores.forEach(s => {
        console.log(`[Store] ID:${s.id} Name:${s.name} Phone:${s.phoneNumber}`);
    });

    console.log('--- Users ---');
    users.forEach(u => {
        console.log(`[User] ID:${u.id} Email:${u.email} Username:${u.username}`);
    });

    strapi.stop();
    process.exit(0);
}

verifyData().catch(console.error);
