import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::reservation.reservation', ({ strapi }) => ({
    async create(ctx) {
        try {
            const { data } = ctx.request.body;

            // Auto-assign table if not provided
            if (data && data.store && data.date && data.time && data.guests) {
                // Skip if assignedTables is explicitly provided (Manual override)
                if (!data.assignedTables || data.assignedTables.length === 0) {
                    const storeService = strapi.service('api::store.store');
                    const result = await (storeService as any).checkAvailability(
                        data.store,
                        data.date,
                        data.time,
                        data.guests
                    );

                    if (!result.available) {
                        return ctx.badRequest('Reservation rejected: ' + (result.reason || 'No availability'), {
                            reason: result.reason,
                            action: result.action
                        });
                    }

                    // 【追加】計算された所要時間を保存データにセットする
                    // これにより、デフォルト値（120分）ではなく、店舗設定（60分等）が適用される
                    if (result.requiredDuration) {
                        data.duration = result.requiredDuration;
                    }

                    // 席の希望キーワードチェック
                    const seatPreferenceKeywords = ['テーブル', 'カウンター', '個室', '席', '指定', '希望'];
                    const hasSeatPreference = data.notes && seatPreferenceKeywords.some((key: string) => data.notes.includes(key));


                    if (result.assignedTables && result.assignedTables.length > 0) {
                        // 複数テーブル（カウンターなど）が割り当てられた場合
                        data.assignedTables = result.assignedTables.map((t: any) => t.documentId);

                        console.log(`[ReservationController] Auto-assigned ${result.assignedTables.length} tables: ${result.assignedTables.map((t: any) => t.name).join(', ')}`);
                    } else if (result.candidateTable) {
                        // Use Document ID for relation in Strapi 5
                        data.assignedTables = [result.candidateTable.documentId];
                        console.log(`[ReservationController] Auto-assigned table ${result.candidateTable.name} (${result.candidateTable.documentId})`);
                    }

                    if (data.assignedTables && data.assignedTables.length > 0) {
                        // Attempt to fix Store relation error by using Integer ID if DocID fails?
                        if (result.storeIdInt) {
                            data.store = result.storeIdInt;
                        }

                        // Fix for "Locale not found" error: ensure reservation matches store locale if any
                        if (result.storeLocale) {
                            data.locale = result.storeLocale;
                            console.log(`[ReservationController] Forcing locale to ${data.locale} to match store.`);
                        } else {
                            delete data.locale;
                        }

                        // FE-Custom: Handle Auto-Acceptance Logic
                        // If store policy is 'auto', we automatically set status to 'confirmed'
                        if (result.bookingAcceptanceMode === 'auto') {
                            if (hasSeatPreference) {
                                console.log(`[ReservationController] Seat preference detected. Downgrading to pending.`);
                                data.status = 'pending'; // 店主確認が必要
                                data.requiresReview = true;
                                data.reviewReason = '席タイプ指定の希望があります';
                            } else {
                                console.log(`[ReservationController] Auto-Acceptance Enabled. Promoting to confirmed.`);
                                data.status = 'confirmed';
                            }
                            // NOTE: Do NOT set confirmedAt here - it triggers afterUpdate to send duplicate email
                            // The afterCreate lifecycle will handle email sending for confirmed status
                        }
                    } else {
                        // Should not happen if available=true in our logic, but fallback
                        console.warn('[ReservationController] Available but no candidate table returned?');
                    }
                }
            }

            console.log(`[ReservationController] Final Data Payload: Store=${data.store}, Tables=${data.assignedTables}, Locale=${data.locale}`);

            // Logging removed to prevent EBUSY/locking issues

            const response = await super.create(ctx);
            return response;

        } catch (error) {
            console.error('Error in reservation create controller:', error);
            // Pass to default error handler or throw
            throw error;
        }
    }
}));
