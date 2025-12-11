/**
 * 店主予約管理コントローラー
 * BE-102 実装
 */

export default {
    /**
     * GET /api/owner/reservations
     * 予約一覧取得（フィルタ対応）
     */
    async list(ctx) {
        const storeId = ctx.request.header['x-store-id'];
        const { date, status, startDate, endDate, page = 1, pageSize = 20 } = ctx.request.query;

        if (!storeId) {
            return ctx.badRequest('X-Store-ID header is required');
        }

        try {
            const where: any = {
                store: { documentId: storeId },
            };

            // 日付フィルタ
            if (date) {
                where.date = date;
            } else if (startDate && endDate) {
                where.date = {
                    $gte: startDate,
                    $lte: endDate,
                };
            } else if (startDate) {
                where.date = { $gte: startDate };
            } else if (endDate) {
                where.date = { $lte: endDate };
            }

            // ステータスフィルタ
            if (status) {
                if (status.includes(',')) {
                    where.status = { $in: status.split(',') };
                } else {
                    where.status = status;
                }
            }

            // ページネーション
            const offset = (parseInt(page as string) - 1) * parseInt(pageSize as string);
            const limit = parseInt(pageSize as string);

            // 予約を取得
            const reservations = await strapi.db.query('api::reservation.reservation').findMany({
                where,
                orderBy: [{ date: 'asc' }, { time: 'asc' }],
                offset,
                limit,
                populate: ['assignedTables', 'customer'],
            });

            // 総件数を取得
            const total = await strapi.db.query('api::reservation.reservation').count({ where });

            ctx.body = {
                success: true,
                data: reservations.map((r) => ({
                    id: r.documentId,
                    reservationNumber: r.reservationNumber,
                    guestName: r.guestName,
                    email: r.email,
                    phone: r.phone,
                    date: r.date,
                    time: r.time,
                    duration: r.duration,
                    guests: r.guests,
                    status: r.status,
                    course: r.course,
                    notes: r.notes,
                    ownerNote: r.ownerNote,
                    ownerReply: r.ownerReply,
                    requiresAttention: r.requiresAttention,
                    isOwnerEntry: r.isOwnerEntry,
                    assignedTables: r.assignedTables?.map((t: any) => ({
                        id: t.documentId,
                        name: t.name,
                        capacity: t.capacity,
                    })) || [],
                    customer: r.customer ? {
                        id: r.customer.documentId,
                        name: r.customer.name,
                        totalVisits: r.customer.totalVisits,
                    } : null,
                    createdAt: r.createdAt,
                    updatedAt: r.updatedAt,
                })),
                meta: {
                    page: parseInt(page as string),
                    pageSize: parseInt(pageSize as string),
                    total,
                    pageCount: Math.ceil(total / parseInt(pageSize as string)),
                },
            };
        } catch (error) {
            strapi.log.error('Reservation list error:', error);
            ctx.internalServerError('Failed to get reservations');
        }
    },

    /**
     * GET /api/owner/reservations/:id
     * 予約詳細取得
     */
    async findOne(ctx) {
        const { id } = ctx.params;
        const storeId = ctx.request.header['x-store-id'];

        if (!storeId) {
            return ctx.badRequest('X-Store-ID header is required');
        }

        try {
            const reservation = await strapi.db.query('api::reservation.reservation').findOne({
                where: { documentId: id, store: { documentId: storeId } },
                populate: ['assignedTables', 'customer', 'store'],
            });

            if (!reservation) {
                return ctx.notFound('Reservation not found');
            }

            ctx.body = {
                success: true,
                data: {
                    id: reservation.documentId,
                    reservationNumber: reservation.reservationNumber,
                    guestName: reservation.guestName,
                    email: reservation.email,
                    phone: reservation.phone,
                    date: reservation.date,
                    time: reservation.time,
                    duration: reservation.duration,
                    guests: reservation.guests,
                    status: reservation.status,
                    course: reservation.course,
                    notes: reservation.notes,
                    ownerNote: reservation.ownerNote,
                    ownerReply: reservation.ownerReply,
                    requiresAttention: reservation.requiresAttention,
                    isOwnerEntry: reservation.isOwnerEntry,
                    language: reservation.language,
                    assignedTables: reservation.assignedTables?.map((t: any) => ({
                        id: t.documentId,
                        name: t.name,
                        capacity: t.capacity,
                    })) || [],
                    customer: reservation.customer ? {
                        id: reservation.customer.documentId,
                        name: reservation.customer.name,
                        email: reservation.customer.email,
                        phone: reservation.customer.phone,
                        totalVisits: reservation.customer.totalVisits,
                        lastVisitDate: reservation.customer.lastVisitDate,
                    } : null,
                    createdAt: reservation.createdAt,
                    updatedAt: reservation.updatedAt,
                },
            };
        } catch (error) {
            strapi.log.error('Reservation findOne error:', error);
            ctx.internalServerError('Failed to get reservation');
        }
    },

    /**
     * PUT /api/owner/reservations/:id/status
     * ステータス更新（メール送信トリガー）
     */
    async updateStatus(ctx) {
        const { id } = ctx.params;
        const { status, ownerReply, assignedTables } = ctx.request.body;
        const storeId = ctx.request.header['x-store-id'];

        if (!storeId) {
            return ctx.badRequest('X-Store-ID header is required');
        }

        if (!status) {
            return ctx.badRequest('status is required');
        }

        const validStatuses = ['pending', 'confirmed', 'rejected', 'cancelled', 'no_show'];
        if (!validStatuses.includes(status)) {
            return ctx.badRequest(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        try {
            // 予約を取得
            const reservation = await strapi.db.query('api::reservation.reservation').findOne({
                where: { documentId: id, store: { documentId: storeId } },
                populate: ['store', 'assignedTables'],
            });

            if (!reservation) {
                return ctx.notFound('Reservation not found');
            }

            const previousStatus = reservation.status;

            // 更新データを準備
            const updateData: any = {
                status,
            };

            // ownerReply が指定されていれば更新
            if (ownerReply !== undefined) {
                updateData.ownerReply = ownerReply;
            }

            // assignedTables が指定されていれば更新
            if (assignedTables !== undefined) {
                // テーブルIDの配列を内部IDに変換
                if (Array.isArray(assignedTables) && assignedTables.length > 0) {
                    const tables = await strapi.db.query('api::table.table').findMany({
                        where: { documentId: { $in: assignedTables } },
                    });
                    updateData.assignedTables = tables.map((t: any) => t.id);
                } else {
                    updateData.assignedTables = [];
                }
            }

            // 予約を更新
            const updatedReservation = await strapi.db.query('api::reservation.reservation').update({
                where: { id: reservation.id },
                data: updateData,
                populate: ['store', 'assignedTables'],
            });

            // ステータスが変更された場合、メール送信
            if (previousStatus !== status && updatedReservation.email) {
                const store = await strapi.db.query('api::store.store').findOne({
                    where: { id: reservation.store?.id },
                });

                if (store) {
                    try {
                        // ownerReplyを含めた予約データでメール送信
                        const reservationWithReply = {
                            ...updatedReservation,
                            ownerReply: ownerReply || updatedReservation.ownerReply,
                        };

                        if (status === 'confirmed') {
                            await strapi.service('api::reservation.email').sendReservationEmail(
                                reservationWithReply,
                                store,
                                'confirmed'
                            );
                            strapi.log.info(`Confirmation email sent for reservation ${updatedReservation.reservationNumber}`);
                        } else if (status === 'rejected') {
                            await strapi.service('api::reservation.email').sendReservationEmail(
                                reservationWithReply,
                                store,
                                'rejected'
                            );
                            strapi.log.info(`Rejection email sent for reservation ${updatedReservation.reservationNumber}`);
                        } else if (status === 'cancelled') {
                            await strapi.service('api::reservation.email').sendReservationEmail(
                                reservationWithReply,
                                store,
                                'cancelled'
                            );
                            strapi.log.info(`Cancellation email sent for reservation ${updatedReservation.reservationNumber}`);
                        }
                    } catch (emailError) {
                        strapi.log.error('Failed to send status change email:', emailError);
                        // メール送信に失敗してもステータス更新は成功とする
                    }
                }
            }

            ctx.body = {
                success: true,
                data: {
                    id: updatedReservation.documentId,
                    reservationNumber: updatedReservation.reservationNumber,
                    previousStatus,
                    status: updatedReservation.status,
                    ownerReply: updatedReservation.ownerReply,
                    emailSent: previousStatus !== status && !!updatedReservation.email,
                    updatedAt: updatedReservation.updatedAt,
                },
                message: `Status updated from ${previousStatus} to ${status}`,
            };
        } catch (error) {
            strapi.log.error('Status update error:', error);
            ctx.internalServerError('Failed to update status');
        }
    },
};
