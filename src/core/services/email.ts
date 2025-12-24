/**
 * メール送信サービス
 * INF-300/301 実装
 */

import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

// AWS SES用のトランスポート設定
const createTransporter = () => {
    const config = {
        host: process.env.SMTP_HOST || 'email-smtp.ap-northeast-1.amazonaws.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER || process.env.AWS_SES_SMTP_USER,
            pass: process.env.SMTP_PASS || process.env.AWS_SES_SMTP_PASS,
        },
    };

    // 開発環境ではEthereal.emailを使用
    if (process.env.NODE_ENV === 'development' && !process.env.SMTP_HOST) {
        return nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: process.env.ETHEREAL_USER,
                pass: process.env.ETHEREAL_PASS,
            },
        });
    }

    return nodemailer.createTransport(config);
};

// テンプレートのキャッシュ
const templateCache: Map<string, handlebars.TemplateDelegate> = new Map();

// テンプレートを読み込んでコンパイル
const loadTemplate = (templateName: string, language: string = 'ja'): handlebars.TemplateDelegate => {
    const cacheKey = `${language}/${templateName}`;

    if (templateCache.has(cacheKey)) {
        return templateCache.get(cacheKey)!;
    }

    const templatePath = path.join(
        __dirname,
        '..',
        '..',
        'templates',
        'email',
        language,
        `${templateName}.html`
    );

    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found: ${templatePath}`);
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

// ステータスを日本語ラベルに変換
const statusLabels: Record<string, string> = {
    pending: '仮受付',
    confirmed: '確定',
    rejected: 'キャンセル',
    cancelled: 'キャンセル済み',
    no_show: 'ノーショー',
};

interface SendEmailOptions {
    to: string;
    subject: string;
    templateName: string;
    variables: {
        reservation: any;
        store: any;
        customer?: any;
        confirmationUrl?: string;
        cancellationUrl?: string;
    };
    language?: string;
}

interface EmailResult {
    success: boolean;
    messageId?: string;
    previewUrl?: string;
    error?: string;
}

export const sendEmail = async (options: SendEmailOptions): Promise<EmailResult> => {
    const { to, subject, templateName, variables, language = 'ja' } = options;

    try {
        // 変数を拡張（フォーマット済みフィールドを追加）
        const enhancedVariables = {
            ...variables,
            reservation: {
                ...variables.reservation,
                dateFormatted: formatDateJapanese(variables.reservation.date),
                statusLabel: statusLabels[variables.reservation.status] || variables.reservation.status,
                assignedTablesText: variables.reservation.assignedTables
                    ?.map((t: any) => t.name)
                    .join(', ') || '',
            },
            currentYear: new Date().getFullYear(),
        };

        // テンプレートをロードしてレンダリング
        const template = loadTemplate(templateName, language);
        const html = template(enhancedVariables);

        // メール送信
        const transporter = createTransporter();
        const fromEmail = process.env.EMAIL_FROM || `noreply@${process.env.EMAIL_DOMAIN || 'example.com'}`;

        const info = await transporter.sendMail({
            from: `"${variables.store.name}" <${fromEmail}>`,
            to,
            subject,
            html,
        });

        // 開発環境ではプレビューURLを返す
        let previewUrl: string | undefined;
        if (process.env.NODE_ENV === 'development') {
            previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
            if (previewUrl) {
                console.log('Preview URL:', previewUrl);
            }
        }

        return {
            success: true,
            messageId: info.messageId,
            previewUrl,
        };
    } catch (error: any) {
        console.error('Email sending error:', error);
        return {
            success: false,
            error: error.message,
        };
    }
};

// 予約ステータス変更時にメールを送信
export const sendReservationEmail = async (
    reservation: any,
    store: any,
    type: 'pending' | 'confirmed' | 'rejected' | 'cancelled'
): Promise<EmailResult> => {
    console.log(`[Service:Email] sendReservationEmail called for ${reservation.id} type=${type}`);
    if (!reservation.email) {
        return {
            success: false,
            error: 'No email address provided',
        };
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
            template: 'reservation_rejected', // 同じテンプレートを流用
            subject: `【${store.name}】予約キャンセルのお知らせ`,
        },
    };

    const config = templateMap[type];
    if (!config) {
        return {
            success: false,
            error: `Unknown email type: ${type}`,
        };
    }

    return sendEmail({
        to: reservation.email,
        subject: config.subject,
        templateName: config.template,
        variables: {
            reservation,
            store,
        },
        language: reservation.language || 'ja',
    });
};

export default {
    sendEmail,
    sendReservationEmail,
};
