import { GoogleGenerativeAI } from "@google/generative-ai";

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

        const modelName = process.env.AI_MODEL_LITE || "gemini-1.5-flash-8b";
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: jsonMode ? "application/json" : "text/plain",
                maxOutputTokens: Number(process.env.AI_MAX_TOKENS_LITE) || 200
            }
        });

        try {
            const result = await Promise.race([
                model.generateContent(prompt),
                new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))
            ]);

            return result.response.text();
        } catch (error) {
            console.error("AiService.generateLite Error:", error);
            throw error;
        }
    },

    /**
     * 備考欄の重要度判定（特化メソッド）
     * タイムアウトエラー時は安全策として true (要確認) を返す
     */
    async classifyNote(note: string): Promise<{ requiresAction: boolean; reason?: string }> {
        if (!note || !note.trim()) return { requiresAction: false };

        // プロンプトインジェクション対策: デリミタで囲む
        const prompt = `
      あなたはレストランの予約管理AIです。
      客の要望が「店側の特別な対応や確認が必要なもの」か「単なる挨拶や報告」か判定してください。
      
      出力は JSON 形式で { "requiresAction": true, "reason": "理由" } のように返してください。
      reasonは店主への短い説明です（例: "アレルギー対応が必要なため"）。

      例:
      "卵アレルギーです" -> { "requiresAction": true, "reason": "食物アレルギー報告あり" }
      "窓際希望" -> { "requiresAction": true, "reason": "座席指定の要望あり" }
      "駐車場はありますか" -> { "requiresAction": true, "reason": "施設に関する質問あり" }
      "楽しみにしています" -> { "requiresAction": false, "reason": "挨拶のみ" }
      "結婚記念日です" -> { "requiresAction": false, "reason": "通常の祝事報告" }

      客のコメント:
      """
      ${note}
      """
    `;

        try {
            // JSONモードで呼び出し
            const jsonText = await this.generateLite(prompt, true);
            const data = JSON.parse(jsonText);
            return {
                requiresAction: data.requiresAction === true,
                reason: data.reason || ""
            };
        } catch (error) {
            console.error("AiService.classifyNote Error/Timeout:", error);
            // エラー時は安全側に倒して「要確認」とする
            return { requiresAction: true, reason: "AI判定エラー/タイムアウトのため安全策として要確認に設定" };
        }
    },

    /**
     * 標準モデルでの実行（レポート/アドバイス用）
     * タイムアウト: 10秒
     */
    async generateStandard(prompt: string): Promise<string> {
        if (!API_KEY) return "APIキー設定なし";

        const modelName = process.env.AI_MODEL_STANDARD || "gemini-1.5-flash";
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
    }
};
