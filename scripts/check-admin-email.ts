import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '..', '.tmp', 'data.db');

const db = new Database(dbPath, { readonly: true });

try {
    // First, list all tables to find the correct admin table name
    console.log('=====================================');
    console.log('Available Tables:');
    console.log('=====================================');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    tables.forEach((table: any) => {
        console.log(`- ${table.name}`);
    });
    console.log('\n');

    // Try to find admin users in different possible table names
    const possibleTableNames = ['admin_users', 'admin_user', 'strapi_users', 'strapi_administrator'];
    let users: any[] = [];
    let foundTable = '';

    for (const tableName of possibleTableNames) {
        try {
            // Check if table exists
            const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tableName);
            if (tableExists) {
                // Try to get users from this table
                users = db.prepare(`SELECT * FROM ${tableName}`).all();
                foundTable = tableName;
                break;
            }
        } catch (err) {
            // Continue to next table name
        }
    }

    console.log('=====================================');
    console.log('Strapi Admin Accounts');
    console.log('=====================================\n');

    if (foundTable) {
        console.log(`Found in table: ${foundTable}\n`);
    }

    if (users.length === 0) {
        console.log('No admin accounts found.');
    } else {
        users.forEach((user: any, index: number) => {
            console.log(`--- Account #${index + 1} ---`);
            console.log(`ID: ${user.id}`);
            console.log(`Email: ${user.email}`);
            console.log(`Username: ${user.username || 'N/A'}`);
            console.log(`Firstname: ${user.firstname || 'N/A'}`);
            console.log(`Lastname: ${user.lastname || 'N/A'}`);
            if (user.isActive !== undefined) console.log(`Active: ${user.isActive ? 'Yes' : 'No'}`);
            if (user.blocked !== undefined) console.log(`Blocked: ${user.blocked ? 'Yes' : 'No'}`);
            console.log('');
        });
    }
} catch (error) {
    console.error('Error:', error);
    process.exit(1);
} finally {
    db.close();
}
