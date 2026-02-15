
import { v2 } from '@google-cloud/translate';

// V2 Client Initialization
// GOOGLE_APPLICATION_CREDENTIALS via .env or default location is used automatically.
const translationClient = new v2.Translate({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
});

export const TranslationService = {
    /**
     * テキスト翻訳 (Google Cloud Translation Basic v2)
     * V3 (Advanced) の権限がないため V2 を使用
     */
    async translate(text: string, targetLanguage: string): Promise<string> {
        if (!text || !text.trim()) return "";

        try {
            // 言語コードの正規化
            // V2 API generally handles standard codes.
            // 'zh-CN', 'zh-TW', 'ja', 'en', 'ko' are standard.

            // translate method returns [string, metadata] for single string input
            const [translation] = await translationClient.translate(text, targetLanguage);

            return translation || text;

        } catch (error) {
            console.error("[TranslationService] Error (V2):", error);
            // エラー時は原文を返す (UI側でエラー表示させるか、原文表示かは要件次第だが、安全策として原文)
            return text;
        }
    }
};
