import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import mime from 'mime-types';

const { createStrapi } = require('@strapi/strapi');

// Initialize Strapi
const strapiInstance = createStrapi({ distDir: './dist' });

async function main() {
    try {
        await strapiInstance.load();
        await strapiInstance.start();

        console.log('Strapi started successfully');

        // Parse command line arguments
        const args = process.argv.slice(2);
        const fileArg = args.find(arg => arg.startsWith('--file='));

        if (!fileArg) {
            console.error('Usage: npm run seed:stores -- --file=./path/to/file.csv');
            process.exit(1);
        }

        const filePath = fileArg.split('=')[1];
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            process.exit(1);
        }

        console.log(`Reading CSV file: ${filePath}`);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        }) as any[];

        console.log(`Found ${records.length} records to process`);

        const errorLogPath = `import_errors_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        const errorRecords: any[] = [];

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const { name, description, phoneNumber, postalCode, address, email, password, image_path, ...otherFields } = record;

            console.log(`Processing [${i + 1}/${records.length}]: ${name}`);

            try {
                // 1. Check Existence (Resume Logic)
                const existingStore = await strapiInstance.db.query('api::store.store').findOne({
                    where: {
                        $or: [
                            { name: name },
                            { phoneNumber: phoneNumber }
                        ]
                    }
                });

                if (existingStore) {
                    console.log(`Skipping: ${name} (Already exists)`);
                    continue;
                }

                // 2. Start Transaction
                await strapiInstance.db.transaction(async ({ trx }: { trx: any }) => {
                    try {
                        // A. Create User (if email/password provided)
                        let userId = null;
                        if (email && password) {
                            const existingUser = await strapiInstance.db.query('plugin::users-permissions.user').findOne({
                                where: { email: email }
                            });

                            if (existingUser) {
                                userId = existingUser.id;
                                console.log(`  User already exists: ${email} (ID: ${userId})`);
                            } else {
                                const newUser = await strapiInstance.plugins['users-permissions'].services.user.add({
                                    username: email.split('@')[0] + '_' + Date.now(),
                                    email,
                                    password,
                                    confirmed: true,
                                    role: 1
                                });
                                userId = newUser.id;
                                console.log(`  Created user: ${email} (ID: ${userId})`);
                            }
                        }

                        // B. Upload Media
                        let mediaId = null;
                        if (image_path && fs.existsSync(image_path)) {
                            const fileName = path.basename(image_path);
                            const stats = fs.statSync(image_path);
                            const mimeType = mime.lookup(image_path) || 'application/octet-stream';

                            const uploadService = strapiInstance.plugins.upload.services.upload;

                            const uploadedFiles = await uploadService.upload({
                                data: {},
                                files: {
                                    path: image_path,
                                    name: fileName,
                                    type: mimeType,
                                    size: stats.size,
                                }
                            });

                            if (uploadedFiles && uploadedFiles.length > 0) {
                                mediaId = uploadedFiles[0].id;
                                console.log(`  Uploaded image: ${fileName} (ID: ${mediaId})`);
                            }
                        } else if (image_path) {
                            console.warn(`  Image file not found: ${image_path}`);
                        }

                        // C. Create Store
                        const storeData: any = {
                            name,
                            description,
                            phoneNumber,
                            postalCode,
                            address,
                            ...otherFields
                        };

                        if (mediaId) {
                            storeData.coverImage = mediaId;
                        }

                        const createdStore = await strapiInstance.db.query('api::store.store').create({
                            data: {
                                ...storeData,
                                publishedAt: new Date(),
                            },
                            transacting: trx
                        });

                        console.log(`  Created store: ${name} (ID: ${createdStore.id})`);

                    } catch (error) {
                        throw error;
                    }
                });

                console.log(`  Commit successful for: ${name}`);

            } catch (error: any) {
                console.error(`  Failed to process: ${record.name}`);
                console.error(`  Error: ${error.message}`);

                // Add to error log
                errorRecords.push({
                    ...record,
                    error_message: error.message
                });
            }
        }

        // Write error log if any
        if (errorRecords.length > 0) {
            const header = Object.keys(errorRecords[0]).join(',');
            const rows = errorRecords.map(r => Object.values(r).map(v => `"${v}"`).join(',')).join('\n');
            fs.writeFileSync(errorLogPath, `${header}\n${rows}`);
            console.log(`\nCompleted with errors. Error log saved to: ${errorLogPath}`);
        } else {
            console.log('\nBulk import completed successfully with no errors.');
        }

        // Stop Strapi
        strapiInstance.stop();
        process.exit(0);

    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

main();
