/**
 * メールテストコントローラー
 * INF-302 実装
 */

import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import * as nodemailer from 'nodemailer';

// テンプレート別の店主メッセージサンプル
const ownerReplyByTemplate: Record<string, string> = {
    reservation_pending: '', // 仮受付時は店主メッセージなし
    reservation_confirmed: 'ご予約ありがとうございます。窓際のお席をご用意いたしました。当日お待ちしております。',
    reservation_rejected: '誠に申し訳ございませんが、ご希望の日時は既に満席となっております。別の日程でのご予約をお待ちしております。',
};

// 基本サンプルデータ
const createSampleData = (templateName: string) => ({
    reservation: {
        reservationNumber: 'R-20251212-TEST',
        guestName: 'テスト太郎',
        email: 'test@example.com',
        phone: '090-1234-5678',
        date: '2025-12-25',
        dateFormatted: '12月25日（水）',
        time: '19:00',
        duration: 120,
        guests: 4,
        status: templateName === 'reservation_confirmed' ? 'confirmed' :
            templateName === 'reservation_rejected' ? 'rejected' : 'pending',
        statusLabel: templateName === 'reservation_confirmed' ? '確定' :
            templateName === 'reservation_rejected' ? '拒否' : '仮受付',
        course: 'クリスマスディナーコース',
        notes: 'アレルギー：卵\n窓際の席希望',
        ownerReply: ownerReplyByTemplate[templateName] || '',
        assignedTablesText: templateName === 'reservation_confirmed' ? 'A-1席、A-2席' : '',
        requiresAttention: false,
    },
    store: {
        name: 'テストレストラン',
        address: '東京都渋谷区テスト1-2-3',
        phoneNumber: '03-1234-5678',
    },
    currentYear: new Date().getFullYear(),
    cancellationUrl: 'https://example.com/cancel/test123',
});

// テンプレートを読み込み
const loadTemplate = (templateName: string, language: string = 'ja'): string | null => {
    const templatePath = path.join(
        process.cwd(),
        'src',
        'templates',
        'email',
        language,
        `${templateName}.html`
    );

    if (!fs.existsSync(templatePath)) {
        return null;
    }

    return fs.readFileSync(templatePath, 'utf-8');
};

export default {
    /**
     * GET /api/test/email/preview/:template
     * メールテンプレートプレビュー
     * 
     * パラメータ:
     *   - template: reservation_pending, reservation_confirmed, reservation_rejected
     * クエリ:
     *   - lang: ja (default)
     *   - guestName: カスタムゲスト名
     *   - ownerReply: カスタム店主返信
     */
    async preview(ctx) {
        const { template } = ctx.params;
        const { lang = 'ja', guestName, ownerReply, status } = ctx.request.query;

        const validTemplates = ['reservation_pending', 'reservation_confirmed', 'reservation_rejected'];
        if (!validTemplates.includes(template)) {
            return ctx.badRequest(`Invalid template. Must be one of: ${validTemplates.join(', ')}`);
        }

        const templateSource = loadTemplate(template, lang as string);
        if (!templateSource) {
            return ctx.notFound(`Template not found: ${template}`);
        }

        // テンプレートに応じたサンプルデータを生成
        const sampleData = createSampleData(template);
        const customData = {
            ...sampleData,
            reservation: {
                ...sampleData.reservation,
                guestName: guestName || sampleData.reservation.guestName,
                ownerReply: ownerReply !== undefined ? ownerReply : sampleData.reservation.ownerReply,
                status: status || sampleData.reservation.status,
            },
        };

        try {
            const compiled = handlebars.compile(templateSource);
            const html = compiled(customData);

            ctx.type = 'text/html';
            ctx.body = html;
        } catch (error: any) {
            strapi.log.error('Template rendering error:', error);
            ctx.internalServerError('Failed to render template');
        }
    },

    /**
     * POST /api/test/email/send
     * テストメール送信
     * 
     * Body:
     *   - to: 送信先メールアドレス (必須)
     *   - template: テンプレート名 (default: reservation_confirmed)
     *   - customData: カスタム変数 (optional)
     */
    async send(ctx) {
        const { to, template = 'reservation_confirmed', customData } = ctx.request.body;

        if (!to) {
            return ctx.badRequest('to (email address) is required');
        }

        // メールアドレスの簡易バリデーション
        if (!to.includes('@')) {
            return ctx.badRequest('Invalid email address format');
        }

        const validTemplates = ['reservation_pending', 'reservation_confirmed', 'reservation_rejected'];
        if (!validTemplates.includes(template)) {
            return ctx.badRequest(`Invalid template. Must be one of: ${validTemplates.join(', ')}`);
        }

        const templateSource = loadTemplate(template, 'ja');
        if (!templateSource) {
            return ctx.notFound(`Template not found: ${template}`);
        }

        // テンプレートに応じたサンプルデータを生成してマージ
        const sampleData = createSampleData(template);
        const mergedData = {
            ...sampleData,
            reservation: {
                ...sampleData.reservation,
                ...(customData?.reservation || {}),
            },
            store: {
                ...sampleData.store,
                ...(customData?.store || {}),
            },
        };

        try {
            const compiled = handlebars.compile(templateSource);
            const html = compiled(mergedData);

            // Ethereal.email を使用してテスト送信
            const testAccount = await nodemailer.createTestAccount();
            const transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass,
                },
            });

            const subjectMap: Record<string, string> = {
                reservation_pending: `【${mergedData.store.name}】ご予約を受け付けました`,
                reservation_confirmed: `【${mergedData.store.name}】ご予約が確定しました`,
                reservation_rejected: `【${mergedData.store.name}】予約についてのお知らせ`,
            };

            const info = await transporter.sendMail({
                from: `"${mergedData.store.name}" <test@example.com>`,
                to,
                subject: subjectMap[template],
                html,
            });

            const previewUrl = nodemailer.getTestMessageUrl(info);

            ctx.body = {
                success: true,
                message: 'Test email sent successfully',
                data: {
                    messageId: info.messageId,
                    previewUrl,
                    to,
                    template,
                    note: 'メールは Ethereal.email に送信されました。previewUrl でプレビューできます。',
                },
            };

            strapi.log.info(`Test email sent. Preview: ${previewUrl}`);
        } catch (error: any) {
            strapi.log.error('Test email error:', error);
            ctx.internalServerError(`Failed to send test email: ${error.message}`);
        }
    },
};
