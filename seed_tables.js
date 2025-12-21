const storeId = 'tj8k7xirmqvz5mvxjayj978c';
const tables = [
    { name: 'テーブル1', baseCapacity: 4, maxCapacity: 6, isActive: true },
    { name: 'テーブル2', baseCapacity: 4, maxCapacity: 6, isActive: true },
    { name: 'テーブル3', baseCapacity: 2, maxCapacity: 4, isActive: true }
];

async function seed() {
    for (const t of tables) {
        const res = await fetch('http://127.0.0.1:1338/api/tables', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: {
                    ...t,
                    store: storeId
                }
            })
        });
        const json = await res.json();
        console.log(`Created ${t.name}:`, json.data ? 'Success' : json);
    }
}

seed();
