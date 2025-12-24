
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../.tmp/data.db');
console.log(`Opening database at: ${dbPath}`);

const db = new Database(dbPath, { readonly: true });

try {
    // 1. List Tables to be sure
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%reservation%'").all();
    console.log('Tables found:', tables.map(t => t.name));

    // 2. Check Stores
    console.log('\n--- Stores ---');
    try {
        const stores = db.prepare("SELECT * FROM stores").all(); // Table name might be 'stores' or 'up_users' etc. Strapi tables usually match plural API name or similar.
        // Actually Strapi 5 might use different names. Let's list all tables first if we fail.
    } catch (e) {
        console.log('Could not select from stores directly, listing all tables:');
        const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log(allTables.map(t => t.name));
    }

    // Let's assume standard Strapi naming or try to find it.
    // If table name is 'reservations'

    console.log('\n--- Reservations on 2025-12-25 ---');
    // Strapi 4/5 structure is often just the collection name
    const reservations = db.prepare("SELECT * FROM reservations WHERE date = '2025-12-25'").all();

    if (reservations.length === 0) {
        console.log('No reservations found matching strict date string.');
    } else {
        console.log(JSON.stringify(reservations, null, 2));
    }

    // Also check links if it is a relational table
    // Strapi sometimes uses link tables like 'reservations_store_links'
    console.log('\n--- Reservation Links ---');
    try {
        const links = db.prepare("SELECT * FROM reservations_store_links").all();
        console.log(`Found ${links.length} store links.`);
        // Filter for our reservation IDs if possible, but let's just see structure
    } catch (e) {
        // Ignore if not exists
    }

} catch (err) {
    console.error('Database Error:', err);
} finally {
    db.close();
}
