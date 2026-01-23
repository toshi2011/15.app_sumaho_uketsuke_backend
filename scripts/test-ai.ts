
import { AiService } from "../src/core/services/ai";
import dotenv from "dotenv";
import path from "path";

// Load env from backend root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function runTests() {
    console.log("--- Starting AI Service Verification ---");
    console.log("API Key present:", !!process.env.GOOGLE_GEMINI_API_KEY);
    console.log("Model Lite:", process.env.AI_MODEL_LITE);
    console.log("Model Standard:", process.env.AI_MODEL_STANDARD);

    // Test 1: Classify Note (Requires Action)
    console.log("\n[Test 1] Classify Note: '卵アレルギーがあります'");
    const result1 = await AiService.classifyNote("卵アレルギーがあります");
    console.log("Result:", result1);
    if (result1.requiresAction === true) console.log("✅ Passive Check Passed");
    else console.log("❌ Failed: Expected true");

    // Test 2: Classify Note (No Action)
    console.log("\n[Test 2] Classify Note: '楽しみにしています'");
    const result2 = await AiService.classifyNote("楽しみにしています");
    console.log("Result:", result2);
    if (result2.requiresAction === false) console.log("✅ Passive Check Passed");
    else console.log("❌ Failed: Expected false");

    // Test 3: Standard Model
    console.log("\n[Test 3] Generate Standard: '短くこんにちはと言ってください'");
    try {
        const text = await AiService.generateStandard("短くこんにちはと言ってください");
        console.log("Result:", text);
        if (text && text.length > 0) console.log("✅ Passed");
        else console.log("❌ Failed: Empty response");
    } catch (e) {
        console.log("❌ Failed with error:", e);
    }

    console.log("\n--- Verification Complete ---");
}

runTests().catch(console.error);
