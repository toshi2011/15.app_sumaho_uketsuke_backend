
require('dotenv').config();
import { TranslationService } from './src/core/services/translation';
import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(process.cwd(), 'verify_log_v2.txt');

// Hook console.error/warn/log
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

function logToFile(msg: string) {
    try {
        fs.appendFileSync(LOG_FILE, msg + '\n');
    } catch (e) { }
}

const hook = (original: any, prefix: string) => {
    return (...args: any[]) => {
        original.apply(console, args);
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        logToFile(`[${prefix}] ${msg}`);
    };
};

console.error = hook(originalError, 'ERROR');
console.warn = hook(originalWarn, 'WARN');
console.log = hook(originalLog, 'LOG');

async function verify() {
    fs.writeFileSync(LOG_FILE, "=== Verification Start ===\n");

    console.log(`CWD: ${process.cwd()}`);

    // Test TranslationService (which should now be V2)
    console.log("\n[Test] TranslationService (V2 Implementation)");
    try {
        const text = "저는 베지테리언입니다. 예약 가능할까요?";
        console.log(`Original: ${text}`);

        const translated = await TranslationService.translate(text, 'ja');
        console.log(`Translated: ${translated}`);

        if (translated !== text && translated.includes("ベジタリアン")) {
            console.log("✅ Translation Success!");
        } else {
            console.log("⚠️ Translation returned original or unexpected text.");
        }
    } catch (e) {
        console.error(`❌ Service Failed:`, e);
    }

    console.log("=== Verification End ===");
}

verify();
