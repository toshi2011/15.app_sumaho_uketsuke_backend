import { GoogleGenerativeAI } from "@google/generative-ai";
import { PROMPT_REGISTRY } from "../ai/prompt-registry";

const API_KEY = process.env.GOOGLE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

export const AiService = {
    /**
     * 軽量モデルでの実行（汎用）
     * タイムアウト: 3秒
     */
    async generateLite(prompt: string, jsonMode: boolean = false): Promise<string> {
        if (!API_KEY) {
            console.warn("AiService: No API Key. Returning empty string.");
            return "";
        }
        const modelName = process.env.AI_MODEL_LITE || "gemini-1.5-flash-001";

        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: jsonMode ? "application/json" : "text/plain",
                maxOutputTokens: Number(process.env.AI_MAX_TOKENS_LITE) || 200
            }
        });

        try {
            // タイムアウトを 3000ms -> 10000ms に変更 (安全マージン確保)
            const result = await Promise.race([
                model.generateContent(prompt),
                new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
            ]);

            return result.response.text();
        } catch (error) {
            console.error(`AiService.generateLite Error (Model: ${modelName}):`, error);
            throw error;
        }
    },

    /**
     * 備考欄の重要度判定 ＆ 顧客情報抽出
     * タイムアウトエラー時は安全策として priority: high (要確認) を返す
     */
    async classifyNote(note: string): Promise<{
        priority: 'high' | 'middle' | 'low';
        requiresAction: boolean;
        reason: string;
        customerTrait?: string | null;
        isPermanent?: boolean;
    }> {
        if (!note || !note.trim()) {
            return {
                priority: 'low',
                requiresAction: false,
                reason: "",
                customerTrait: null
            };
        }

        const prompt = PROMPT_REGISTRY.CLASSIFY_NOTE(note);

        try {
            const jsonText = await this.generateLite(prompt, true);
            const data = JSON.parse(jsonText);

            // バリデーションとデフォルト値設定
            const priority = (['high', 'middle', 'low'].includes(data.priority)) ? data.priority : 'high';

            return {
                priority: priority,
                requiresAction: data.requiresAction === true,
                reason: data.reason || "",
                customerTrait: data.customerTrait || null,
                isPermanent: data.isPermanent === true
            };
        } catch (error) {
            console.error("AiService.classifyNote Error/Timeout:", error);
            // エラー時は安全側に倒して「High (要確認)」とする
            return {
                priority: 'high',
                requiresAction: true,
                reason: "AI判定に失敗したため、安全のため要確認としています",
                customerTrait: null
            };
        }
    },

    /**
     * 標準モデルでの実行（レポート/アドバイス用）
     * タイムアウト: 10秒
     */
    async generateStandard(prompt: string): Promise<string> {
        if (!API_KEY) return "APIキー設定なし";

        const modelName = process.env.AI_MODEL_STANDARD || "gemini-1.5-flash-001";
        const model = genAI.getGenerativeModel({ model: modelName });

        try {
            const result = await Promise.race([
                model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        maxOutputTokens: Number(process.env.AI_MAX_TOKENS_STANDARD) || 1000
                    }
                }),
                new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
            ]);

            return result.response.text();
        } catch (error) {
            console.error("AiService.generateStandard Error:", error);
            return "生成に失敗しました。";
        }
    },

    // 【削除】翻訳機能は TranslationService へ移動したため削除
    // async translateMessage(...) { ... }  <-- 削除
};
