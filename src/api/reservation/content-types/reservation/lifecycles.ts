/**
 * Reservation ライフサイクルフック
 * ステータス変更時に自動メール送信
 */

export default {
    async afterCreate(event) {
        const { result } = event;

        // メールアドレスがなければスキップ
        if (!result.email) {
            return;
        }

        // 店主登録（source: 'owner'）の場合はメールを送信しない
        if (result.source === 'owner') {
            strapi.log.info(`Skipping email for owner-created reservation ${result.id}`);
            return;
        }

        try {
            // 予約データを店舗情報付きで再取得
            const reservationWithStore = await strapi.entityService.findOne(
                'api::reservation.reservation',
                result.id,
                { populate: ['store'] }
            ) as any;

            const store = reservationWithStore?.store;

            if (!store) {
                strapi.log.warn(`Store not found for reservation ${result.id}`);
                return;
            }

            // ステータスに応じてメール送信
            if (result.status === 'pending') {
                // 仮受付メール
                await strapi.service('api::reservation.email').sendReservationEmail(
                    reservationWithStore,
                    store,
                    'pending'
                );
                strapi.log.info(`Pending email sent for reservation ${result.id}`);
            } else if (result.status === 'confirmed') {
                // 自動確定の場合は確定メール
                await strapi.service('api::reservation.email').sendReservationEmail(
                    reservationWithStore,
                    store,
                    'confirmed'
                );
                strapi.log.info(`Confirmation email sent for auto-approved reservation ${result.id}`);
            }
        } catch (error) {
            strapi.log.error('Failed to send email:', error);
        }
    },

    async afterUpdate(event) {
        const { result, params } = event;

        // statusが変更された場合のみメール送信
        const newStatus = result.status;

        if (!result.email) {
            return;
        }

        // confirmedAt または cancelledAt が設定されている場合のみメール送信
        // （店主が直接登録した場合はこれらのフィールドがない）
        const data = params?.data;
        strapi.log.info('afterUpdate params.data:', JSON.stringify(data));
        const isStatusChangeFromPending = data?.confirmedAt || data?.cancelledAt;

        if (!isStatusChangeFromPending) {
            strapi.log.info('No confirmedAt/cancelledAt, skipping email (likely owner-created reservation)');
            return;
        }

        try {
            // 予約データを店舗情報付きで再取得
            const reservationWithStore = await strapi.entityService.findOne(
                'api::reservation.reservation',
                result.id,
                { populate: ['store'] }
            ) as any;

            const store = reservationWithStore?.store;

            if (!store) {
                strapi.log.warn('Store not found for reservation:', result.id);
                return;
            }

            // ステータスに応じてメール送信
            if (newStatus === 'confirmed') {
                await strapi.service('api::reservation.email').sendReservationEmail(
                    reservationWithStore,
                    store,
                    'confirmed'
                );
                strapi.log.info(`Confirmation email sent for reservation ${result.id}`);
            } else if (newStatus === 'rejected' || newStatus === 'cancelled') {
                await strapi.service('api::reservation.email').sendReservationEmail(
                    reservationWithStore,
                    store,
                    'cancelled'
                );
                strapi.log.info(`Cancellation email sent for reservation ${result.id}`);
            }
        } catch (error) {
            strapi.log.error('Failed to send status change email:', error);
        }
    },
};
