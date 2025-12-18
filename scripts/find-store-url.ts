const { createStrapi } = require('@strapi/strapi');

const strapiInstance = createStrapi({ distDir: './dist' });

async function main() {
    try {
        const args = process.argv.slice(2);
        const storeName = args[0];

        if (!storeName) {
            console.error('Please provide a store name argument.');
            console.error('Usage: npx ts-node scripts/find-store-url.ts "Store Name"');
            process.exit(1);
        }

        // Only load, do not start to avoid port conflicts
        await strapiInstance.load();

        console.log(`Searching for store: ${storeName}`);

        const store = await strapiInstance.db.query('api::store.store').findOne({
            where: { name: storeName },
        });

        if (store) {
            console.log(`Store found:`);
            console.log(`Name: ${store.name}`);
            console.log(`Document ID: ${store.documentId}`);
            console.log(`ID: ${store.id}`);
            console.log(`URL: http://localhost:3000/store/${store.documentId}`);
        } else {
            console.log(`Store not found: ${storeName}`);
        }

        strapiInstance.stop();
        process.exit(0);

    } catch (error) {
        console.error('Error:', error);
        strapiInstance.stop();
        process.exit(1);
    }
}

main();
