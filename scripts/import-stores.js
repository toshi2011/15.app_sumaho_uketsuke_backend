const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { v4: uuidv4 } = require('uuid');
const { createStrapi } = require('@strapi/strapi');

// Helper to determine mime type
const getMimeType = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
    };
    return map[ext] || 'application/octet-stream';
};

async function importStores() {
    // Initialize Strapi
    const strapi = createStrapi({ distDir: './dist' });
    await strapi.load();

    const csvFilePath = path.join(__dirname, 'stores.txt');
    const seedImagesBaseDir = path.join(__dirname, '../seed-images');
    const results = { success: 0, skipped: 0, failed: 0 };
    const errors = [];

    const stores = [];

    // Read CSV
    await new Promise((resolve, reject) => {
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (data) => stores.push(data))
            .on('end', resolve)
            .on('error', reject);
    });

    console.log(`Found ${stores.length} stores to import.`);

    // Helper to upload file
    const uploadFile = async (filePath, name) => {
        try {
            const stats = fs.statSync(filePath);
            const buffer = fs.readFileSync(filePath);
            const mime = getMimeType(filePath);

            const uploadedFiles = await strapi.plugin('upload').service('upload').upload({
                files: {
                    path: filePath,
                    name: name,
                    type: mime,
                    size: stats.size,
                    buffer: buffer,
                },
                data: {},
            });
            return uploadedFiles[0];
        } catch (e) {
            console.error(`Failed to upload ${name}:`, e.message);
            return null;
        }
    };

    // Helper to get random file from directory
    const getRandomFile = (dirPath) => {
        if (!fs.existsSync(dirPath)) return null;
        const files = fs.readdirSync(dirPath).filter(f => !f.startsWith('.')); // Ignore hidden files
        if (files.length === 0) return null;
        const randomFile = files[Math.floor(Math.random() * files.length)];
        return path.join(dirPath, randomFile);
    };

    for (const storeData of stores) {
        const {
            name,
            email,
            phoneNumber,
            address,
            description,
            logo_path,
            cover_path, // Note: This might be ignored in favor of random logic if not present, or used if present? Prompt says "Based on CSV category... Randomly select". I will prioritize the random logic as requested, but maybe fallback to this if provided? The prompt implies replacing the logic. I'll follow the prompt's "Random Selection" logic strictly.
            gender,
            age_range,
            platforms,
            category = 'other', // Default to other
        } = storeData;

        try {
            await strapi.db.transaction(async ({ trx }) => {
                // 1. Duplicate Check
                const existingStore = await strapi.db.query('api::store.store').findOne({
                    where: {
                        $or: [
                            { phoneNumber: phoneNumber },
                        ]
                    },
                    transacting: trx
                });

                const existingUser = await strapi.db.query('plugin::users-permissions.user').findOne({
                    where: { email: email },
                    transacting: trx
                });

                if (existingStore || existingUser) {
                    console.log(`Skipping: ${name} (Duplicate found)`);
                    results.skipped++;
                    return;
                }

                // 2. Create User
                const role = await strapi.db.query('plugin::users-permissions.role').findOne({
                    where: { type: 'authenticated' },
                    transacting: trx
                });

                const password = Math.random().toString(36).slice(-8) + 'Aa1!';

                // Note: entityService.create does NOT support transacting directly in v4.
                // We use db.query.create to ensure transaction safety, but this skips lifecycles.
                // For bulk import, this is usually acceptable.
                const user = await strapi.db.query('plugin::users-permissions.user').create({
                    data: {
                        username: email,
                        email: email,
                        password: password,
                        confirmed: true,
                        role: role.id,
                        provider: 'local'
                    },
                    transacting: trx
                });

                // 3. Handle Images
                let logoId = null;
                let coverId = null;

                // A. Logo Image (Specific Matching)
                if (logo_path) {
                    const specificLogoPath = path.join(seedImagesBaseDir, 'logos', logo_path);
                    if (fs.existsSync(specificLogoPath)) {
                        const uploadedLogo = await uploadFile(specificLogoPath, logo_path);
                        if (uploadedLogo) logoId = uploadedLogo.id;
                    }
                }

                // B. Cover Image (Random Selection)
                let selectedCoverPath = null;
                const categoryDir = path.join(seedImagesBaseDir, 'covers', category);

                // Try category folder
                selectedCoverPath = getRandomFile(categoryDir);

                // Fallback to 'other'
                if (!selectedCoverPath) {
                    const otherDir = path.join(seedImagesBaseDir, 'covers', 'other');
                    selectedCoverPath = getRandomFile(otherDir);
                }

                if (selectedCoverPath) {
                    const coverName = path.basename(selectedCoverPath);
                    const uploadedCover = await uploadFile(selectedCoverPath, coverName);
                    if (uploadedCover) coverId = uploadedCover.id;
                }

                // 4. Create Store
                const adminToken = uuidv4();
                const digitalPresence = {};
                if (platforms) {
                    platforms.split(',').forEach(p => {
                        const key = p.trim();
                        if (key) digitalPresence[key] = true;
                    });
                }

                const ownerInfo = {
                    gender: gender || 'unknown',
                    ageRange: age_range || 'unknown',
                    note: 'Imported via bulk script'
                };

                const newStore = await strapi.db.query('api::store.store').create({
                    data: {
                        name,
                        description,
                        phoneNumber,
                        address,
                        status: 'LEAD',
                        adminToken,
                        ownerInfo,
                        digitalPresence,
                        logoImage: logoId,
                        coverImage: coverId,
                        // owner: user.id // Uncomment if relation exists
                    },
                    transacting: trx
                });

                // 5. Sample Menu Injection (Crucial)
                // Name: "【サンプル】メニューを登録してみましょう"
                // Price: 0
                // Description: "管理画面の「メニュー設定」から、あなたのお店の自慢のメニューに入れ替えてください。"
                // Image: null

                await strapi.db.query('api::menu-item.menu-item').create({
                    data: {
                        name: '【サンプル】メニューを登録してみましょう',
                        price: 0,
                        description: '管理画面の「メニュー設定」から、あなたのお店の自慢のメニューに入れ替えてください。',
                        store: newStore.id,
                        // Assuming 'store' is the relation name in menu-item. 
                        // If it's different, this needs to be adjusted.
                        // Usually it's 'store'.
                    },
                    transacting: trx
                });

                console.log(`Created: ${name} (ID: ${newStore.id})`);
                results.success++;
            });
        } catch (error) {
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

    // Stop Strapi
    strapi.stop();
    process.exit(0);
}

importStores().catch(err => {
    console.error(err);
    fs.writeFileSync(path.join(__dirname, 'error.log'), err.stack || err.message);
    process.exit(1);
});

