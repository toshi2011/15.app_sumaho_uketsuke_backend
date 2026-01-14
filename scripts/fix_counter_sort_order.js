const { createStrapi } = require('@strapi/strapi');

async function fixSortOrders() {
    const strapi = await createStrapi({ distDir: './dist' }).load();

    const tables = await strapi.entityService.findMany('api::table.table', {
        filters: { isActive: true },
        populate: ['store']
    });

    console.log(`Checking ${tables.length} active tables...`);

    for (const table of tables) {
        // Match "Counter X-Y" or "カウンターX-Y" or "Counter-Y" etc.
        // Assume format: "Name-Number"
        // Regex: /^(.*)-(\d+)$/

        const match = table.name.match(/^(.*)-(\d+)$/);
        if (match) {
            const prefix = match[1];
            const num = parseInt(match[2], 10);

            // Heuristic for prefix sort:
            // "Counter 1" -> 100
            // "Counter 2" -> 200
            // "カウンター" -> 100 (default)
            // Just use a hash or simple index if possible, 
            // but strict sequentiality requires stable prefix mapping.

            // For now, let's look at existing sortOrder. 
            // If it's 100 (default), we might want to update it.
            // If it was supposed to be set by migration but failed, it might be null or default.

            // Simple logic: 
            // If name has "Counter" or "カウンター":
            // Try to extract a "Section Number" from prefix? e.g. "Counter 1"

            let sectionBase = 100;
            const digitMatch = prefix.match(/(\d+)/);
            if (digitMatch) {
                sectionBase = parseInt(digitMatch[1], 10) * 100;
            }

            const newSortOrder = sectionBase + num;

            console.log(`Updating ${table.name} (id:${table.id}): sortOrder ${table.sortOrder} -> ${newSortOrder}`);

            await strapi.entityService.update('api::table.table', table.id, {
                data: { sortOrder: newSortOrder }
            });
        }
    }

    console.log("Done.");
    process.exit(0);
}

fixSortOrders();
