import dotenv from 'dotenv';
import path from 'path';

// Load env BEFORE other imports
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function verifyGreeting() {
    // Dynamic import to ensure env is loaded first
    const { AiService } = await import('../src/core/services/ai');

    console.log('--- Verify AI Greeting Classification ---');

    // Check API Key
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
        console.error("ERROR: GOOGLE_GEMINI_API_KEY is missing. Check .env file.");
        return;
    }

    const testCases = [
        "よろしくお願いします",
        "楽しみにしてます",
        "アレルギーは特にありません",
        "窓際希望です",
        "请多关照" // Chinese: Yoroshiku onegaishimasu
    ];

    for (const note of testCases) {
        console.log(`\nTesting: "${note}"`);
        try {
            const result = await AiService.classifyNote(note);
            console.log("Result:", JSON.stringify(result, null, 2));

            if (note === "よろしくお願いします" && result.requiresAction) {
                console.error("FAIL: 'よろしくお願いします' should NOT require action.");
            } else if (note === "窓際希望です" && !result.requiresAction) {
                console.error("FAIL: '窓際希望です' SHOULD require action.");
            } else {
                console.log("PASS");
            }
        } catch (e) {
            console.error("Error:", e);
        }
    }
}

verifyGreeting();
