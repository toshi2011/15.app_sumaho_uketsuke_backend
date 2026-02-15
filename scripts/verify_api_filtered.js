async function verifyFilteredApi() {
    const storeDocId = 'yxezke33o8wm6q2zq1zrna7d';
    const FILTERED_URL = `http://localhost:1337/api/reservations?populate=*&filters[store][documentId][$eq]=${storeDocId}&sort=date:desc`;

    console.log(`Fetching: ${FILTERED_URL}`);

    try {
        const res = await fetch(FILTERED_URL);
        if (!res.ok) {
            console.error(`HTTP Error: ${res.status} ${res.statusText}`);
            console.error(await res.text());
            return;
        }

        const json = await res.json();
        console.log(`Total Found: ${json.data.length}`);

        json.data.slice(0, 5).forEach(r => {
            console.log(`ID:${r.id} Date:${r.attributes.date} Time:${r.attributes.time} Status:${r.attributes.status}`);
        });

    } catch (e) {
        console.error('Fetch Error:', e);
    }
}

verifyFilteredApi();
