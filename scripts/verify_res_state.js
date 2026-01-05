
const Strapi = require('@strapi/strapi');

async function checkState() {
    // Avoid loading full strapi if possible, but need DB.
    // Assuming server is running, we might face lock.
    // But verify_ticket01_http.js uses fetch.
    // I will use fetch to avoid lock.

    // Using fetch means I need the API URL.
    const fetch = require('node-fetch'); // May not be available? 
    // Strapi includes axios or fetch usually? 
    // I'll use standard http.

    const http = require('http');

    const token = ''; // No token? Need public or auth. 
    // I don't have token. 

    // I must use Strapi instance logic but retry if locked?
    // Or just use the 'verify_ticket01_http.js' approach if I can (it uses axios/fetch but authentication?).
    // 'verify_ticket01_http.js' logs in as admin/owner?

    // Let's rely on internal script with retry?
    // No, better to try DB read. Read-only might work?

    const app = await Strapi.createStrapi({ distDir: './dist' }).load();

    const resId = 'a6h2wfzr40ytcoe8d01rrzuv';
    const res = await app.db.query('api::reservation.reservation').findOne({
        where: { documentId: resId },
        populate: ['assignedTables']
    });

    console.log('--- DB State Check ---');
    console.log('ID:', res.id);
    console.log('DocumentID:', res.documentId);
    console.log('Assigned Tables:', JSON.stringify(res.assignedTables));
    console.log('Time:', res.time);

    process.exit(0);
}

checkState();
