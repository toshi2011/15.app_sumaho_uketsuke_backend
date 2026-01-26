/**
 * 翻訳APIコントローラー
 * Ticket-03: AI翻訳返信フロー
 */

import { AiService } from '../../../core/services/ai';

export default {
    async translate(ctx) {
        const { text, targetLanguage } = ctx.request.body;

        // バリデーション
        if (!text || !targetLanguage) {
            return ctx.badRequest('Missing required fields: text and targetLanguage');
        }

        try {
            const translatedText = await AiService.translateMessage(text, targetLanguage);
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
