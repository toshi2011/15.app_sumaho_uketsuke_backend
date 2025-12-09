const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '.tmp', 'data.db');

try {
    const db = new Database(dbPath, { readonly: true });

    console.log('=== Strapi管理者アカウント一覧 ===\n');

    const users = db.prepare('SELECT id, email, username, firstname, lastname, isActive, blocked FROM admin_users').all();

    if (users.length === 0) {
        console.log('管理者アカウントが見つかりませんでした。');
    } else {
        users.forEach((user, index) => {
            console.log(`--- アカウント ${index + 1} ---`);
            console.log(`ID: ${user.id}`);
            console.log(`メールアドレス: ${user.email}`);
            console.log(`ユーザー名: ${user.username || 'なし'}`);
            console.log(`名前: ${user.firstname || ''} ${user.lastname || ''}`);
            console.log(`アクティブ: ${user.isActive ? 'はい' : 'いいえ'}`);
            console.log(`ブロック: ${user.blocked ? 'はい' : 'いいえ'}`);
            console.log('');
        });
    }

    db.close();
} catch (error) {
    console.error('エラー:', error.message);
    process.exit(1);
}
