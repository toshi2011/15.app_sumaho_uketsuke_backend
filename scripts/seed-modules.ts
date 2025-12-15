
const { createStrapi } = require('@strapi/strapi');

async function main() {
    // Initialize Strapi
    const strapi = createStrapi({ distDir: './dist' });

    try {
        await strapi.load();
        await strapi.start();

        const desiredModuleSlug = 'reservation_basic';

        // 1. Moduleの存在確認・作成 (findOrCreate)
        let moduleEntity = await strapi.db.query('api::module.module').findOne({
            where: { slug: desiredModuleSlug },
        });

        if (!moduleEntity) {
            console.log(`Creating module: ${desiredModuleSlug}`);
            moduleEntity = await strapi.entityService.create('api::module.module', {
                data: {
                    slug: desiredModuleSlug,
                    name: '基本予約機能',
                    description: '基本的な予約管理機能を提供します。',
                    monthlyPrice: 0,
                },
            });
        } else {
            console.log(`Module already exists: ${desiredModuleSlug}`);
        }

        // 2. 全Storeに対してStoreModuleを作成
        const stores = await strapi.entityService.findMany('api::store.store', {
            populate: ['store_modules', 'store_modules.module'],
        });

        for (const store of stores) {
            // すでにこのモジュールが紐付いているかチェック
            const hasModule = store.store_modules?.some((sm: any) => sm.module?.slug === desiredModuleSlug);

            if (!hasModule) {
                console.log(`Enabling module for store: ${store.name}`);
                await strapi.entityService.create('api::store-module.store-module', {
                    data: {
                        store: store.id,
                        module: moduleEntity.id,
                        isEnabled: true,
                        settings: {},
                    },
                });
            } else {
                console.log(`Module already enabled for store: ${store.name}`);
            }
        }

        console.log('Seed script completed successfully.');

        strapi.stop();
        process.exit(0);

    } catch (error) {
        console.error('Error in seed script:', error);
        if (error instanceof Error) {
            console.error(error.stack);
        }
        strapi.stop();
        process.exit(1);
    }
}

main();
