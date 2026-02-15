const { createStrapi } = require('@strapi/strapi');

const fs = require('fs');
const log = (msg) => { console.log(msg); fs.appendFileSync('update_log.txt', msg + '\n'); };

async function updateTables() {
    const app = await createStrapi({ distDir: './dist' }).load();
    const STORE_DOC_ID = 'yxezke33o8wm6q2zq1zrna7d';

    try {
        const store = await app.db.query('api::store.store').findOne({
            where: { documentId: STORE_DOC_ID },
            populate: ['tables']
        });

        if (!store) {
            log('Store not found');
            process.exit(1);
        }

        const tables = store.tables;
        // Assume names are fixed as per previous log
        // Table: テーブル1 (Cap 4) -> table
        // Table: テーブル2 (Cap 4) -> counter
        // Table: テーブル3 (Cap 2) -> table

        for (const t of tables) {
            let type = 'table';
            if (t.name === 'テーブル2') type = 'counter';

            log(`Updating ${t.name} (DocID: ${t.documentId}) to type: ${type}`);
            const updated = await app.db.query('api::table.table').update({
                where: { documentId: t.documentId },
                data: { type }
            });
            log(`Updated ${t.name}: Type is now ${updated.type}`);
        }
        log('Update complete.');

    } catch (e) {
        log(e.toString());
    }
    process.exit(0);
}

updateTables();
