/**
 * 翻訳APIコントローラー
 * Ticket-03: AI翻訳返信フロー
 */

// import { AiService } from '../../../core/services/ai';
import { TranslationService } from '../../../core/services/translation';

export default {
    async translate(ctx) {
        const { text, targetLanguage } = ctx.request.body;

        // バリデーション
        if (!text || !targetLanguage) {
            return ctx.badRequest('Missing required fields: text and targetLanguage');
        }

        try {
            // Google Cloud Translation を使用
            const translatedText = await TranslationService.translate(text, targetLanguage);
            ctx.body = {
                success: true,
                translatedText
            };
        } catch (error: any) {
            console.error('[Translate API] Error:', error);
            ctx.body = {
                success: false,
                error: error.message || 'Translation failed'
            };
        }
    }
};
