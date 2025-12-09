import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { v4 as uuidv4 } from 'uuid';

const Strapi = require('@strapi/strapi');

async function importStores() {
    // Initialize Strapi without starting the server (to avoid port conflicts, though DB lock might still occur)
    const strapi = await Strapi({ distDir: './dist' }).load();

    const csvFilePath = path.join(__dirname, 'stores.txt'); // Using stores.txt as created previously
    const seedImagesDir = path.join(__dirname, '../seed-images');
    const results = { success: 0, skipped: 0, failed: 0 };
    const errors: any[] = [];

    if (!fs.existsSync(csvFilePath)) {
        console.error(`File not found: ${csvFilePath}`);
        process.exit(1);
    }

    console.log(`Reading file: ${csvFilePath}`);
    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    const stores = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    }) as any[];

    console.log(`Found ${stores.length} stores to import.`);

    for (const storeData of stores) {
        const {
            name,
            email,
            phoneNumber,
            address,
            description,
            logo_path,
            cover_path,
            gender,
            age_range,
            platforms,
        } = storeData;

        try {
            await strapi.db.transaction(async ({ trx }: { trx: any }) => {
                // 1. Duplicate Check
                const existingStore = await strapi.db.query('api::store.store').findOne({
                    where: {
                        $or: [
                            { phoneNumber: phoneNumber },
                        ]
                    }
                });

                const existingUser = await strapi.db.query('plugin::users-permissions.user').findOne({
                    where: { email: email }
                });

                if (existingStore || existingUser) {
                    console.log(`Skipping: ${name} (Duplicate found)`);
                    results.skipped++;
                    return;
                }

                // 2. Create User
                const role = await strapi.db.query('plugin::users-permissions.role').findOne({
                    where: { type: 'authenticated' }
                });

                const password = Math.random().toString(36).slice(-8) + 'Aa1!';

                // Note: Using entityService directly. 
                // In TS, types might be an issue if not fully typed, but 'any' usage or direct JS-like usage often works in scripts.
                const user = await strapi.entityService.create('plugin::users-permissions.user', {
                    data: {
                        username: email,
                        email: email,
                        password: password,
                        confirmed: true,
                        role: role.id,
                        provider: 'local'
                    }
                });

                // 3. Upload Media (Mocked for now as per previous logic, can be expanded)
                if (logo_path && fs.existsSync(path.join(seedImagesDir, logo_path))) {
                    console.log(`[Mock] Uploading logo: ${logo_path}`);
                }

                // 4. Create Store
                const adminToken = uuidv4();

                const digitalPresence: any = {};
                if (platforms) {
                    platforms.split(',').forEach((p: string) => {
                        const key = p.trim();
                        if (key) digitalPresence[key] = true;
                    });
                }

                const ownerInfo = {
                    gender: gender || 'unknown',
                    ageRange: age_range || 'unknown',
                    note: 'Imported via bulk script'
                };

                const newStore = await strapi.entityService.create('api::store.store', {
                    data: {
                        name,
                        description,
                        phoneNumber,
                        address,
                        status: 'LEAD',
                        adminToken,
                        ownerInfo,
                        digitalPresence,
                    }
                });

                console.log(`Created: ${name} (ID: ${newStore.id})`);
                results.success++;
            });
        } catch (error: any) {
            console.error(`Failed: ${name}`, error.message);
            results.failed++;
            errors.push({ name, error: error.message });
        }
    }

    console.log('--------------------------------');
    console.log('Import Completed');
    console.log(`Success: ${results.success}`);
    console.log(`Skipped: ${results.skipped}`);
    console.log(`Failed: ${results.failed}`);

    if (errors.length > 0) {
        const errorCsv = errors.map(e => `${e.name},${e.error}`).join('\n');
        fs.writeFileSync(path.join(__dirname, '../import-errors.csv'), `name,error\n${errorCsv}`);
        console.log('Errors saved to import-errors.csv');
    }

    strapi.stop();
    process.exit(0);
}

importStores().catch(err => {
    console.error(err);
    process.exit(1);
});
