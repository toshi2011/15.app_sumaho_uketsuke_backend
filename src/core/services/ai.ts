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
     * タイムアウトエラー時は安全策として true (要確認) を返す
     */
    async classifyNote(note: string): Promise<{ requiresAction: boolean; reason?: string; customerTrait?: string | null }> {
        if (!note || !note.trim()) return { requiresAction: false, customerTrait: null };

        // プロンプトインジェクション対策: デリミタで囲む
        const prompt = `
      あなたはレストランの予約管理AIです。客のコメントを分析してください。

      【タスク】
      1. 店側の特別な対応や確認が必要か判定せよ ("requiresAction")
      2. その理由を短く述べよ ("reason")
      3. **顧客プロフィールとして長期保存すべき重要な情報**（アレルギー、記念日、好き嫌い、子供の有無など）があれば抽出せよ ("customerTrait")
         - 保存すべき情報がない場合は null にせよ
         - "楽しみにしています" などの挨拶は保存不要
         - "結婚記念日です" -> "結婚記念日(1/25)" のように抽象化して抽出
      
      出力は JSON 形式のみ: { "requiresAction": boolean, "reason": string, "customerTrait": string | null }

      例:
      "卵アレルギーです" -> { "requiresAction": true, "reason": "アレルギー対応", "customerTrait": "アレルギー: 卵" }
      "窓際希望" -> { "requiresAction": true, "reason": "座席指定", "customerTrait": "座席好み: 窓際" }
      "駐車場はありますか" -> { "requiresAction": true, "reason": "質問あり", "customerTrait": null }
      "楽しみにしています" -> { "requiresAction": false, "reason": "挨拶", "customerTrait": null }
      "結婚記念日です" -> { "requiresAction": false, "reason": "祝事報告", "customerTrait": "記念日: 結婚記念日" }

      客のコメント:
      """
      ${note}
      """
    `;

        try {
            // JSONモードで呼び出し
            const jsonText = await this.generateLite(prompt, true);
            const data = JSON.parse(jsonText);

            const result = {
                requiresAction: data.requiresAction === true,
                reason: data.reason || "",
                customerTrait: data.customerTrait || null
            };

            // 成功ログ (デバッグ用)
            console.log(`[AiService] Classify Success: Action=${result.requiresAction}, Reason=${result.reason}`);

            return result;
        } catch (error) {
            console.error("AiService.classifyNote Error/Timeout:", error);
            // エラー時は安全側に倒して「要確認」とする
            return { requiresAction: true, reason: `AI判定エラー/タイムアウトのため安全策として要確認に設定: ${error instanceof Error ? error.message : String(error)}`, customerTrait: null };
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
    },

    // 【削除】翻訳機能は TranslationService へ移動したため削除
    // async translateMessage(...) { ... }  <-- 削除
};
