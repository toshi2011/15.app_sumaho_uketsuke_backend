import { AiService } from '../../../core/services/ai';

export default ({ strapi }) => ({
    async generateWeeklyReport(storeId: string) {
        // 1. Calculate Date Range
        const today = new Date();
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);

        // 2. Fetch Data
        const reservations = await strapi.db.query('api::reservation.reservation').findMany({
            where: {
                store: storeId,
                date: { $gte: lastWeek.toISOString().split('T')[0] },
            },
            populate: ['customer'],
        });

        // 3. Aggregate Stats
        const total = reservations.length;
        const confirmed = reservations.filter((r: any) => r.status === 'confirmed').length;
        const canceled = reservations.filter((r: any) => r.status === 'canceled').length;

        // Extract Notes for Context (Anonymized)
        const recentNotes = reservations
            .filter((r: any) => r.notes)
            .map((r: any) => `・${r.notes}`)
            .slice(0, 10)
            .join("\n");

        const summaryText = `
    期間: ${lastWeek.toISOString().split('T')[0]} 〜 ${today.toISOString().split('T')[0]}
    総予約数: ${total}件
    確定: ${confirmed}件
    キャンセル: ${canceled}件
    完了: ${reservations.filter((r: any) => r.status === 'completed').length}件
    
    主な顧客要望・備考:
    ${recentNotes || "特になし"}
    `;

        // 4. Generate with AI
        const prompt = `
      以下の週間予約データを元に、店主向けの短い週報（400文字程度）を書いてください。
      ポジティブなトーンで、来週に向けた一言アドバイスを含めてください。
      
      ${summaryText}
    `;

        const report = await AiService.generateStandard(prompt);
        return report;
    }
});
