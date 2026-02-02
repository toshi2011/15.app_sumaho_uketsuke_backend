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
     * タイムアウトエラー時は安全策として true (要確認) を返す
     */
    async classifyNote(note: string): Promise<{
        requiresAction: boolean;
        reason?: string;
        customerTrait?: string | null;
        isPermanent?: boolean; // 恒久的な特徴（アレルギー等）かどうかの判定を追加
    }> {
        if (!note || !note.trim()) return { requiresAction: false, customerTrait: null };

        const prompt = `
        あなたはレストランの予約管理AIです。客のコメントを分析し、店主が「顧客台帳」に記録すべき重要な事実を抽出してください。

        【分析ルール】
        1. 特別な対応（アレルギー、質問回答、記念日対応）が必要なら "requiresAction": true。
        2. "customerTrait" の抽出ルール：
          - 「誰の」「何を」をセットで具体的に記述（例：「妻の誕生日」「両親の銀婚式」「本人がエビアレルギー」）。
          - 勝手にカテゴリ（結婚記念日など）に変換せず、客の表現を尊重すること。
          - 挨拶（よろしくお願いします等）しかない場合は null。
          - 好み：「好み：[内容]」
        3. "isPermanent" の判定基準（重要）：
          - true（恒久特性）：アレルギー、宗教上の禁忌、苦手な食材、身体的特徴、永続的な好み。
          - false（単発イベント）：今回の来店限定の質問、今年のお祝い（誕生日・記念日）、今回の席指定。
        4. "reason" は店主への短い通知メッセージ。

        出力は JSON 形式のみ: { "requiresAction": boolean, "reason": string, "customerTrait": string | null, "isPermanent": boolean }

        客のコメント:
        """
        ${note}
        """
        `;

        try {
            const jsonText = await this.generateLite(prompt, true);
            const data = JSON.parse(jsonText);

            return {
                requiresAction: data.requiresAction === true,
                reason: data.reason || "",
                customerTrait: data.customerTrait || null,
                isPermanent: data.isPermanent === true // 新規追加
            };
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
