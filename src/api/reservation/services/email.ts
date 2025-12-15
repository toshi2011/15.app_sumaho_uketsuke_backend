/**
 * メール送信サービス (Strapi Service)
 * INF-300/301 実装
 */

import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { AdapterFactory } from '../../../adapters/factory';

// テンプレートのキャッシュ
const templateCache: Map<string, handlebars.TemplateDelegate> = new Map();

// Template caching and AWS configuration handled by Adapter now (AWS config moved).
// Only template loading pertains to this service.

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

        // Adapterを使用してメール送信
        const emailAdapter = AdapterFactory.getEmailAdapter();

        // Note: The adapter interface currently only supports (to, subject, body).
        // Custom "from" names like `"${store.name}" <${fromEmail}>` are not yet supported by the simple interface
        // unless we update it. For now, we rely on the adapter's default or simplest sending mechanism.
        // To maintain the "From" behavior seamlessly, we might need to update the interface or accept 
        // that the adapter handles 'from' configuration centrally. 
        // *However*, we can pass the store name in the body or subject (already done).
        // If we strictly need dynamic sender names, we should refactor the interface later.

        return await emailAdapter.sendMail(
            reservation.email,
            config.subject,
            html
        );
    },
});
