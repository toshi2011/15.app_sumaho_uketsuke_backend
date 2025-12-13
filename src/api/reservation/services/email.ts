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

    if (templateCache.has(cacheKey)) {
        return templateCache.get(cacheKey)!;
    }

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
        if (!reservation.email) {
            console.log('No email address provided, skipping email');
            return { success: false, error: 'No email address' };
        }

        const templateMap: Record<string, { template: string; subject: string }> = {
            pending: {
                template: 'reservation_pending',
                subject: `【${store.name}】ご予約を受け付けました`,
            },
            confirmed: {
                template: 'reservation_confirmed',
                subject: `【${store.name}】ご予約が確定しました`,
            },
            rejected: {
                template: 'reservation_rejected',
                subject: `【${store.name}】予約についてのお知らせ`,
            },
            cancelled: {
                template: 'reservation_rejected',
                subject: `【${store.name}】予約キャンセルのお知らせ`,
            },
        };

        const config = templateMap[type];
        if (!config) {
            return { success: false, error: `Unknown email type: ${type}` };
        }

        const language = reservation.language || 'ja';
        const template = loadTemplate(config.template, language);

        if (!template) {
            console.log(`Template ${config.template} not found, skipping email`);
            return { success: false, error: 'Template not found' };
        }

        // 変数を拡張
        const variables = {
            reservation: {
                ...reservation,
                dateFormatted: formatDateJapanese(reservation.date),
                statusLabel: statusLabels[reservation.status] || reservation.status,
                assignedTablesText: reservation.assignedTables
                    ?.map((t: any) => t.name)
                    .join(', ') || '',
            },
            store,
            currentYear: new Date().getFullYear(),
        };

        const html = template(variables);

        const transporter = createTransporter();
        if (!transporter) {
            console.log('SMTP not configured, email content:');
            console.log(`To: ${reservation.email}`);
            console.log(`Subject: ${config.subject}`);
            console.log('HTML generated successfully');
            return { success: true, mock: true };
        }

        try {
            const fromEmail = process.env.EMAIL_FROM || `noreply@${process.env.EMAIL_DOMAIN || 'example.com'}`;
            const info = await transporter.sendMail({
                from: `"${store.name}" <${fromEmail}>`,
                to: reservation.email,
                subject: config.subject,
                html,
            });

            return { success: true, messageId: info.messageId };
        } catch (error: any) {
            console.error('Email sending error:', error);
            return { success: false, error: error.message };
        }
    },
});
