const { createStrapi } = require('@strapi/strapi');

const fs = require('fs');

async function listStores() {
    const app = await createStrapi({ distDir: './dist' }).load();
    try {
        const stores = await app.entityService.findMany('api::store.store', { fields: ['name', 'documentId'] });
        let output = '--- Stores List ---\n';
        stores.forEach(s => {
            output += `- ${s.name} (ID: ${s.id}, DocID: ${s.documentId})\n`;
        });
        fs.writeFileSync('stores_list.txt', output);
        console.log('Written to stores_list.txt');
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

listStores();
