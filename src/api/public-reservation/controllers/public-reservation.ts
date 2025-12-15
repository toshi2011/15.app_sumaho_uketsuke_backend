/**
 * 公開予約コントローラー
 * BE-103 実装: リードタイム検証付き予約作成
 */

export default {
    /**
     * POST /api/public/reservations
     * 予約作成（リードタイム検証あり）
     * 
     * isOwnerEntry: true の場合はリードタイム制限を無視
     */
    async create(ctx) {
        const {
            storeId,
            guestName,
            email,
            phone,
            date,
            time,
            guests,
            notes,
            course,
            language = 'ja',
            isOwnerEntry = false,
        } = ctx.request.body;

        // 必須フィールドの検証
        if (!storeId) {
            return ctx.badRequest('storeId is required');
        }
        if (!guestName) {
            return ctx.badRequest('guestName is required');
        }
        if (!date) {
            return ctx.badRequest('date is required');
        }
        if (!time) {
            return ctx.badRequest('time is required');
        }
        if (!guests || guests < 1) {
            return ctx.badRequest('guests must be at least 1');
        }

        // 店主エントリーでない場合はメールアドレス必須
        if (!isOwnerEntry && !email) {
            return ctx.badRequest('email is required for guest reservations');
        }

        try {
            // 店舗情報を取得
            const store = await strapi.db.query('api::store.store').findOne({
                where: { documentId: storeId },
            });

            if (!store) {
                return ctx.notFound('Store not found');
            }

            // BE-103: リードタイム検証
            // 店主用エントリーの場合はスキップ
            if (!isOwnerEntry) {
                const minLeadTime = store.minBookingLeadTime || 180; // デフォルト180分（3時間）

                // 予約日時を計算
                const [hours, minutes] = time.split(':').map(Number);
                const reservationDateTime = new Date(date);
                reservationDateTime.setHours(hours, minutes, 0, 0);

                // 現在時刻 + リードタイム
                const now = new Date();
                const minAllowedTime = new Date(now.getTime() + minLeadTime * 60 * 1000);

                if (reservationDateTime < minAllowedTime) {
                    return ctx.badRequest(
                        '当日の直前予約はお電話にて承ります。',
                        {
                            code: 'BOOKING_LEAD_TIME_VIOLATION',
                            minLeadTimeMinutes: minLeadTime,
                            requestedTime: reservationDateTime.toISOString(),
                            minAllowedTime: minAllowedTime.toISOString(),
                        }
                    );
                }
            }

            // 予約番号を生成
            const reservationNumber = `R-${date.replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

            // 予約を作成
            const reservation = await strapi.db.query('api::reservation.reservation').create({
                data: {
                    guestName,
                    email: email || null,
                    phone: phone || null,
                    date,
                    time,
                    guests,
                    notes: notes || null,
                    course: course || null,
                    language,
                    isOwnerEntry,
                    status: 'pending',
                    reservationNumber,
                    duration: store.defaultDuration || 120,
                    store: store.id,
                },
            });

            // 仮受付メール送信（isOwnerEntry でなく、メールがある場合）
            if (!isOwnerEntry && email) {
                try {
                    await strapi.service('api::reservation.email').sendReservationEmail(
                        { ...reservation, email },
                        store,
                        'pending'
                    );
                    strapi.log.info(`Pending email sent for reservation ${reservationNumber}`);
                } catch (emailError) {
                    strapi.log.error('Failed to send pending email:', emailError);
                }
            }

            ctx.body = {
                success: true,
                data: {
                    id: reservation.documentId,
                    reservationNumber,
                    guestName,
                    date,
                    time,
                    guests,
                    status: 'pending',
                },
                message: 'ご予約を受け付けました。確定メールをお待ちください。',
            };
        } catch (error: any) {
            strapi.log.error('Reservation create error:', error);
            ctx.internalServerError('Failed to create reservation');
        }
    },

    /**
     * GET /api/public/reservations/:reservationNumber
     * 予約番号で予約を取得
     */
    async findByNumber(ctx) {
        const { reservationNumber } = ctx.params;

        if (!reservationNumber) {
            return ctx.badRequest('reservationNumber is required');
        }

        try {
            const reservation = await strapi.db.query('api::reservation.reservation').findOne({
                where: { reservationNumber },
                populate: ['store'],
            });

            if (!reservation) {
                return ctx.notFound('Reservation not found');
            }

            ctx.body = {
                success: true,
                data: {
                    reservationNumber: reservation.reservationNumber,
                    guestName: reservation.guestName,
                    date: reservation.date,
                    time: reservation.time,
                    guests: reservation.guests,
                    status: reservation.status,
                    storeName: reservation.store?.name,
                    ownerReply: reservation.ownerReply,
                },
            };
        } catch (error: any) {
            strapi.log.error('Reservation find error:', error);
            ctx.internalServerError('Failed to find reservation');
        }
    },
};
