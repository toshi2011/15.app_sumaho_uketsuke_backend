/**
 * Reservation ライフサイクルフック
 * ステータス変更時に自動メール送信
 */

export default {
    async afterCreate(event) {
        const { result } = event;

        // 予約作成時に仮受付メールを送信
        if (result.email && result.status === 'pending') {
            try {
                // 店舗情報を取得
                const store = await strapi.db.query('api::store.store').findOne({
                    where: { id: result.store?.id },
                });

                if (store) {
                    // メールサービスを呼び出し
                    await strapi.service('api::reservation.email').sendReservationEmail(result, store, 'pending');
                    strapi.log.info(`Pending email sent for reservation ${result.reservationNumber}`);
                }
            } catch (error) {
                strapi.log.error('Failed to send pending email:', error);
            }
        }
    },

    async afterUpdate(event) {
        const { result, params } = event;

        // statusが変更された場合のみメール送信
        const newStatus = result.status;

        if (!result.email) {
            return;
        }

        try {
            // 店舗情報を取得
            const store = await strapi.db.query('api::store.store').findOne({
                where: { id: result.store?.id },
            });

            if (!store) {
                strapi.log.warn('Store not found for reservation:', result.id);
                return;
            }

            // ステータスに応じてメール送信
            if (newStatus === 'confirmed') {
                await strapi.service('api::reservation.email').sendReservationEmail(result, store, 'confirmed');
                strapi.log.info(`Confirmation email sent for reservation ${result.reservationNumber}`);
            } else if (newStatus === 'rejected') {
                await strapi.service('api::reservation.email').sendReservationEmail(result, store, 'rejected');
                strapi.log.info(`Rejection email sent for reservation ${result.reservationNumber}`);
            } else if (newStatus === 'cancelled') {
                await strapi.service('api::reservation.email').sendReservationEmail(result, store, 'cancelled');
                strapi.log.info(`Cancellation email sent for reservation ${result.reservationNumber}`);
            }
        } catch (error) {
            strapi.log.error('Failed to send status change email:', error);
        }
    },
};
