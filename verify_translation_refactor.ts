
require('dotenv').config();
import { TranslationService } from './src/core/services/translation';
import { AiService } from './src/core/services/ai';

async function verify() {
    console.log("=== Verification Start ===");

    // 1. Verify TranslationService
    console.log("\n[Test 1] Translation Service");
    try {
        const text = "こんにちは、予約をお願いします。";
        // Mocking console.warn to avoid clutter if project ID is missing
        const originalWarn = console.warn;
        // console.warn = () => {};

        const translated = await TranslationService.translate(text, 'en');
        // console.warn = originalWarn;

        console.log(`Original: ${text}`);
        console.log(`Translated (en): ${translated}`);

        if (translated) {
            console.log("✅ Translation check executed");
        }
    } catch (e) {
        console.error("❌ Translation Failed:", e);
    }

    // 2. Verify AiService.classifyNote (Gemini)
    console.log("\n[Test 2] AI Classify Note");

    // Case A: Allergy (Should be True)
    try {
        const noteA = "卵アレルギーがあります。";
        console.log(`Input: ${noteA}`);
        const resultA = await AiService.classifyNote(noteA);
        console.log("Result:", JSON.stringify(resultA));
        if (resultA.requiresAction === true) {
            console.log("✅ Allergy check passed (requiresAction: true)");
        } else {
            console.error("❌ Allergy check failed");
        }
    } catch (e) {
        console.error("❌ Allergy check error:", e);
    }

    // Case B: Anniversary (Should be False for action, but might extract trait)
    try {
        const noteB = "結婚記念日です。";
        console.log(`Input: ${noteB}`);
        const resultB = await AiService.classifyNote(noteB);
        console.log("Result:", JSON.stringify(resultB));
        if (resultB.requiresAction === false) {
            console.log("✅ Anniversary check passed (requiresAction: false)");
        } else {
            console.error("❌ Anniversary check failed");
        }

    } catch (e) {
        console.error("❌ Anniversary check error:", e);
    }

    console.log("\n=== Verification End ===");
}

verify();
