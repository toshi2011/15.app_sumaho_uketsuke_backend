// Simulate the TimelineView packing logic in JS

function runTest() {
    console.log("Starting Repro...");

    const store = {
        lunchDuration: 50, // USER SETTING: 50 mins
        dinnerDuration: 120
    };

    // Reservation A: 12:00, duration null (should be 50)
    const resA = { id: 1, time: "12:00", duration: null, name: "Res A" };

    // Reservation B: 13:00, duration null (should be 50)
    const resB = { id: 2, time: "13:00", duration: null, name: "Res B" };

    // Sorting (Pre-sorted)
    const sorted = [resA, resB];
    const lanes = [];

    // Helper
    const timeToMinutes = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    sorted.forEach(res => {
        const start = timeToMinutes(res.time);

        // Logic from TimelineView.tsx lines 271-291
        // Simplified for Repro

        let placed = false;
        for (const lane of lanes) {
            const lastItem = lane[lane.length - 1];
            const lastStart = timeToMinutes(lastItem.time);

            // BUG IS HERE:
            // const lastDuration = (lastItem as any).duration || 90;
            const lastDuration = lastItem.duration || 90;

            const lastEnd = lastStart + lastDuration;

            console.log(`Checking Lane for ${res.name} (${start}): LastItem ${lastItem.name} Ends ${lastEnd} (Duration used: ${lastDuration})`);

            if (lastEnd <= start) {
                lane.push(res);
                placed = true;
                break;
            }
        }
        if (!placed) lanes.push([res]);
    });

    console.log("Lanes Result:");
    lanes.forEach((l, i) => {
        console.log(`Lane ${i + 1}: ${l.map(r => r.name).join(', ')}`);
    });

    if (lanes.length === 1) {
        console.log("SUCCESS: Packed in 1 lane.");
    } else {
        console.log("FAILURE: Packed in multiple lanes (Ghost overlap).");
    }
}

runTest();
