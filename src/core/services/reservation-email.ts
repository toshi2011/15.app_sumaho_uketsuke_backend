/**
 * メール送信サービス (Strapi Service)
 * INF-300/301 実装
 */

import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

// テンプレートのキャッシュ
const templateCache: Map<string, handlebars.TemplateDelegate> = new Map();

// AWS SES用のトランスポート設定
const createTransporter = () => {
    const config: any = {
        host: process.env.SMTP_HOST || 'email-smtp.ap-northeast-1.amazonaws.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.SMTP_USER || process.env.AWS_SES_SMTP_USER,
            pass: process.env.SMTP_PASS || process.env.AWS_SES_SMTP_PASS,
        },
        tls: {
            // 自己署名証明書エラーを回避（開発環境用）
            rejectUnauthorized: false,
        },
    };

    // 開発環境でSMTP設定がない場合はログ出力のみ
    if (!config.auth.user || !config.auth.pass) {
        return null;
    }

    return nodemailer.createTransport(config);
};

// テンプレートを読み込み
const loadTemplate = (templateName: string, language: string = 'ja'): handlebars.TemplateDelegate | null => {
    const cacheKey = `${language}/${templateName}`;

    // if (templateCache.has(cacheKey)) {
    //     return templateCache.get(cacheKey)!;
    // }

    const templatePath = path.join(
        process.cwd(),
        'src',
        'templates',
        'email',
        language,
        `${templateName}.html`
    );

    if (!fs.existsSync(templatePath)) {
        console.warn(`Template not found: ${templatePath}`);
        return null;
    }

    const templateSource = fs.readFileSync(templatePath, 'utf-8');
    const template = handlebars.compile(templateSource);
    templateCache.set(cacheKey, template);

    return template;
};

// 日付を日本語フォーマットに変換
const formatDateJapanese = (dateStr: string): string => {
    const date = new Date(dateStr);
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = days[date.getDay()];
    return `${month}月${day}日（${dayOfWeek}）`;
};

const statusLabels: Record<string, string> = {
    pending: '仮受付',
    confirmed: '確定',
    rejected: 'キャンセル',
    cancelled: 'キャンセル済み',
    no_show: 'ノーショー',
};

export default () => ({
    async sendReservationEmail(reservation: any, store: any, type: 'pending' | 'confirmed' | 'rejected' | 'cancelled') {
        const language = reservation.language || 'ja';

        const requestId = Math.random().toString(36).substring(7);
        const logPrefix = `[Service:Email:${requestId}][Store:${store.name}(${store.id || store.documentId})][Res:${reservation.id}][Lang:${language}]`;
        strapi.log.info(`${logPrefix} sendReservationEmail called. Type=${type}`);

        if (!reservation.email) {
            strapi.log.warn(`${logPrefix} No email address provided, skipping email`);
            return { success: false, error: 'No email address' };
        }

        // 件名の多言語対応定義 (省略)
        const subjectMap: Record<string, Record<string, string>> = {
            ja: {
                pending: `【${store.name}】ご予約を受け付けました`,
                confirmed: `【${store.name}】ご予約が確定しました`,
                rejected: `【${store.name}】予約についてのお知らせ`,
                cancelled: `【${store.name}】予約キャンセルのお知らせ`,
            },
            en: {
                pending: `[${store.name}] Reservation Received`,
                confirmed: `[${store.name}] Reservation Confirmed`,
                rejected: `[${store.name}] Reservation Update`,
                cancelled: `[${store.name}] Reservation Cancelled`,
            },
            ko: {
                pending: `[${store.name}] 예약이 접수되었습니다`,
                confirmed: `[${store.name}] 예약이 확정되었습니다`,
                rejected: `[${store.name}] 예약 관련 알림`,
                cancelled: `[${store.name}] 예약 취소 알림`,
            },
            'zh-CN': {
                pending: `[${store.name}] 预约已接收`,
                confirmed: `[${store.name}] 预约已确认`,
                rejected: `[${store.name}] 预约通知`,
                cancelled: `[${store.name}] 预约取消通知`,
            },
            'zh-TW': {
                pending: `[${store.name}] 預約已接收`,
                confirmed: `[${store.name}] 預約已確認`,
                rejected: `[${store.name}] 預約通知`,
                cancelled: `[${store.name}] 預約取消通知`,
            },
        };

        const templateMap: Record<string, string> = {
            pending: 'reservation_pending',
            confirmed: 'reservation_confirmed',
            rejected: 'reservation_rejected',
            cancelled: 'reservation_rejected',
        };

        const templateName = templateMap[type];
        if (!templateName) {
            return { success: false, error: `Unknown email type: ${type}` };
        }

        // 言語に対応する件名を取得（デフォルトは日本語）
        const subjects = subjectMap[language] || subjectMap['ja'];
        const subject = subjects[type] || subjects['pending'];

        const template = loadTemplate(templateName, language);

        if (!template) {
            strapi.log.error(`${logPrefix} Template ${templateName} not found for language ${language}, skipping email`);
            return { success: false, error: 'Template not found' };
        }

        // 変数を拡張
        const cancellationUrl = reservation.cancelToken
            ? `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reservation/cancel/${reservation.cancelToken}?lang=${language}`
            : '';

        // lifecycles.ts から ownerReplyTranslated が渡されてくる想定
        let ownerReplyDisplay = reservation.ownerReply;

        // Frontend (ReservationDetailModal) might have already combined translation and original.
        // Check if we need to combine them here.
        if (reservation.ownerReplyTranslated && reservation.ownerReply) {
            // If the ownerReply already contains the translation (simple check), don't append.
            // Or safer: If ownerReply is substantially longer than translation, assume it's combined?
            // Best approach: If frontend functionality is sending combined text, backend should trust it.
            // But we need to support cases where translation happens purely on backend too?
            // Given the bug report "Duplicate", let's assume if ownerReply contains the translated text, we skip.

            // Simple duplicate check: if ownerReply includes the translated text, use ownerReply as is.
            if (reservation.ownerReply.includes(reservation.ownerReplyTranslated)) {
                ownerReplyDisplay = reservation.ownerReply;
            } else {
                // Format: "Translated Text\n\n(Original: ...)"
                ownerReplyDisplay = `${reservation.ownerReplyTranslated}\n\n(Original Message:\n${reservation.ownerReply})`;
            }
        } else if (reservation.ownerReplyTranslated) {
            ownerReplyDisplay = reservation.ownerReplyTranslated;
        }

        // Debug Log
        strapi.log.info(`${logPrefix} Cancellation URL generated: ${cancellationUrl}`);
        strapi.log.info(`${logPrefix} OwnerReply check: Raw='${reservation.ownerReply}', Translated='${reservation.ownerReplyTranslated}', Display='${ownerReplyDisplay}'`);

        const variables = {
            reservation: {
                ...reservation,
                ownerReply: ownerReplyDisplay, // Override for template
                dateFormatted: formatDateJapanese(reservation.date),
                statusLabel: statusLabels[reservation.status] || reservation.status,
                assignedTablesText: reservation.assignedTables
                    ?.map((t: any) => t.name)
                    .join(', ') || '',
            },
            store,
            currentYear: new Date().getFullYear(),
            cancellationUrl,
        };

        strapi.log.info(`${logPrefix} Template Variables: ownerReply='${variables.reservation.ownerReply}', cancellationUrl='${variables.cancellationUrl}'`);

        const html = template(variables);
        const transporter = createTransporter();

        if (!transporter) {
            strapi.log.info(`${logPrefix} SMTP not configured. Mock send.`);
            strapi.log.info(`${logPrefix} To: ${reservation.email}, Subject: ${subject}`);
            strapi.log.info(`${logPrefix} HTML generated successfully`);
            return { success: true, mock: true };
        }

        try {
            const fromEmail = process.env.EMAIL_FROM || `noreply@${process.env.EMAIL_DOMAIN || 'example.com'}`;
            const info = await transporter.sendMail({
                from: `"${store.name}" <${fromEmail}>`,
                to: reservation.email,
                subject: subject,
                html,
            });

            strapi.log.info(`${logPrefix} Email sent successfully. MessageId=${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } catch (error: any) {
            strapi.log.error(`${logPrefix} Email sending error:`, error);
            return { success: false, error: error.message };
        }
    },
});
