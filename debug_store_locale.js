const strapiFactory = require('@strapi/strapi');

async function check() {
    const strapi = await strapiFactory().load();
    try {
        const storeId = 'tj8k7xirmqvz5mvxjayj978c';
        // Use document service to inspect raw document
        const docs = await strapi.documents('api::store.store').findMany({
            filters: { documentId: storeId },
            status: 'published'
        });

        console.log('Found Stores with this DocID:', JSON.stringify(docs, null, 2));

        if (docs.length > 0) {
            console.log('Locale:', docs[0].locale);
        } else {
            // Try draft
            const drafts = await strapi.documents('api::store.store').findMany({
                filters: { documentId: storeId },
                status: 'draft'
            });
            console.log('Found Drafts:', JSON.stringify(drafts, null, 2));
        }

    } catch (e) {
        console.error(e);
    }
}

check();
