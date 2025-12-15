/**
 * 顧客履歴集約サービス
 * BE-104 実装
 */

export default () => ({
    /**
     * 電話番号をキーにして過去の予約データを検索・集約
     */
    async getCustomerStats(phone: string, storeId: string) {
        if (!phone) {
            return null;
        }

        try {
            // 同じ電話番号の過去の予約を検索
            const reservations = await strapi.db.query('api::reservation.reservation').findMany({
                where: {
                    phone,
                    store: { documentId: storeId },
                },
                orderBy: { date: 'desc' },
            });

            if (reservations.length === 0) {
                return {
                    visitCount: 0,
                    lastVisit: null,
                    cancelCount: 0,
                    noShowCount: 0,
                    notesHistory: [],
                    isFirstTime: true,
                };
            }

            // 来店回数（confirmed + no_show は来店扱い）
            const visitCount = reservations.filter(
                (r) => r.status === 'confirmed' || r.status === 'no_show'
            ).length;

            // キャンセル回数
            const cancelCount = reservations.filter(
                (r) => r.status === 'cancelled' || r.status === 'rejected'
            ).length;

            // ノーショー回数
            const noShowCount = reservations.filter(
                (r) => r.status === 'no_show'
            ).length;

            // 最終来店日（confirmed の最新）
            const confirmedReservations = reservations.filter(
                (r) => r.status === 'confirmed'
            );
            const lastVisit = confirmedReservations.length > 0
                ? confirmedReservations[0].date
                : null;

            // 過去の備考欄をまとめる（重複排除、空文字除外）
            const notesSet = new Set<string>();
            reservations.forEach((r) => {
                if (r.notes && r.notes.trim()) {
                    // 改行で分割して個別に追加
                    r.notes.split('\n').forEach((note: string) => {
                        const trimmed = note.trim();
                        if (trimmed) {
                            notesSet.add(trimmed);
                        }
                    });
                }
            });
            const notesHistory = Array.from(notesSet).slice(0, 10); // 最大10件

            return {
                visitCount,
                lastVisit,
                cancelCount,
                noShowCount,
                notesHistory,
                isFirstTime: visitCount === 0,
                totalReservations: reservations.length,
            };
        } catch (error) {
            strapi.log.error('Customer stats error:', error);
            return null;
        }
    },

    /**
     * メールアドレスでも検索（電話番号がない場合のフォールバック）
     */
    async getCustomerStatsByEmail(email: string, storeId: string) {
        if (!email) {
            return null;
        }

        try {
            const reservations = await strapi.db.query('api::reservation.reservation').findMany({
                where: {
                    email,
                    store: { documentId: storeId },
                },
                orderBy: { date: 'desc' },
            });

            if (reservations.length === 0) {
                return null;
            }

            const visitCount = reservations.filter(
                (r) => r.status === 'confirmed'
            ).length;

            const cancelCount = reservations.filter(
                (r) => r.status === 'cancelled' || r.status === 'rejected'
            ).length;

            return {
                visitCount,
                cancelCount,
                totalReservations: reservations.length,
            };
        } catch (error) {
            strapi.log.error('Customer stats by email error:', error);
            return null;
        }
    },
});
