/**
 * Reservation ライフサイクルフック
 * ステータス変更時に自動メール送信
 */

// afterCreate後にメールが送信済みである予約を追跡する
// afterUpdateからの重複送信を防ぐため
const emailAlreadySentForCreate = new Set<number>();

// Email deduplication history for afterUpdate
// Key: `${reservationId}:${status}`
// Value: timestamp
const emailSentHistory = new Map<string, number>();

const { v4: uuidv4 } = require('uuid');

// Global set to track email sent for specific ID (Session duration)
const emailSentSession = new Set<string>();

export default {
    async beforeCreate(event) {
        const { data } = event.params;
        // キャンセル用トークンの生成
        if (!data.cancelToken) {
            data.cancelToken = uuidv4();
        }
    },

    async beforeUpdate(event) {
        const { params } = event;
        const data = params.data;

        // ステータスがキャンセル・拒否に変更される場合、canceledAt (L1) を自動設定
        // Schema definition: status="canceled", canceledAt (L1)
        if (data && (data.status === 'rejected' || data.status === 'canceled') && !data.canceledAt) {
            strapi.log.info(`[Lifecycle:beforeUpdate] Auto-setting canceledAt for status: ${data.status}`);
            data.canceledAt = new Date().toISOString();
        }
    },

    async afterCreate(event) {
        const { result } = event;
        strapi.log.info(`[Lifecycle:afterCreate] ID=${result.id} Status=${result.status}`);

        // [Prevention] Double execution guard
        // 1. Same ID check (in case of double event firing)
        const cacheKey = `${result.id}-created`;

        if (emailSentSession.has(cacheKey)) {
            strapi.log.warn(`[Lifecycle:afterCreate] DUPLICATE EVENT for ID ${result.id}, skipping`);
            return;
        }
        emailSentSession.add(cacheKey);

        // 2. Same Content check (in case of double record creation)
        if (result.email && result.date && result.time) {
            // Key: email-date-time (sufficient for detecting double submissions)
            const contentKey = `${result.email}-${result.date}-${result.time}`;
            const lastSeen = emailSentHistory.get(contentKey);
            const now = Date.now();

            if (lastSeen && (now - lastSeen < 60000)) { // 1 minute window
                strapi.log.warn(`[Lifecycle:afterCreate] DUPLICATE CONTENT DETECTED. Blocking email for ${contentKey}. ID: ${result.id}`);
                return;
            }
            emailSentHistory.set(contentKey, now);
        }

        // メールアドレスがなければスキップ
        if (!result.email) {
            console.log(`[Lifecycle:afterCreate] No email for ${result.id}`);
            return;
        }

        // 店主登録（source: 'owner'）の場合はメールを送信しない
        if (result.source === 'owner') {
            strapi.log.info(`[Lifecycle:afterCreate] Skipping email for owner-created reservation ${result.id}`);
            return;
        }

        try {
            // 予約データを店舗情報付きで再取得
            const reservationWithStore = await strapi.entityService.findOne(
                'api::reservation.reservation',
                result.id,
                { populate: ['store'] }
            ) as any;

            console.log(`[Lifecycle:afterCreate] Fetched reservation with store. Store ID: ${reservationWithStore?.store?.id}`);

            const store = reservationWithStore?.store;

            if (!store) {
                strapi.log.warn(`[Lifecycle:afterCreate] Store not found for reservation ${result.id}`);
                return;
            }

            // ステータスに応じてメール送信
            let emailResult: any = null;

            if (result.status === 'pending') {
                console.log(`[Lifecycle:afterCreate] Sending PENDING email for ${result.id}`);
                // 仮受付メール
                emailResult = await strapi.service('api::reservation.email').sendReservationEmail(
                    reservationWithStore,
                    store,
                    'pending'
                );

                // Mark this reservation as having email sent (attempted)
                emailAlreadySentForCreate.add(result.id);
                const dedupKey = `${result.id}:pending`;
                emailSentHistory.set(dedupKey, Date.now());

            } else if (result.status === 'confirmed') {
                console.log(`[Lifecycle:afterCreate] Sending CONFIRMED email for ${result.id} (auto-approved)`);
                // 自動確定の場合は確定メール
                emailResult = await strapi.service('api::reservation.email').sendReservationEmail(
                    reservationWithStore,
                    store,
                    'confirmed'
                );

                // Mark this reservation as having email sent
                emailAlreadySentForCreate.add(result.id);
                const dedupKey = `${result.id}:confirmed`;
                emailSentHistory.set(dedupKey, Date.now());
            }

            // DBにステータスを保存 (Logging)
            if (emailResult) {
                const emailStatus = emailResult.success ? 'sent' : 'failed';
                const emailError = emailResult.error || null;

                if (!emailResult.success) {
                    strapi.log.error(`[Lifecycle:afterCreate] Email failed for ${result.id}: ${emailError}`);
                } else {
                    strapi.log.info(`[Lifecycle:afterCreate] Email sent for ${result.id}`);
                }

                await strapi.db.query('api::reservation.reservation').update({
                    where: { id: result.id },
                    data: { emailStatus, emailError }
                });
            }
        } catch (error) {
            console.error('[Lifecycle:afterCreate] Error:', error);
            strapi.log.error('Failed to send email:', error);
        }
    },

    async afterUpdate(event) {
        const { result, params } = event;

        // CRITICAL: Check if email was already sent by afterCreate
        if (emailAlreadySentForCreate.has(result.id)) {
            console.log(`[Lifecycle:afterUpdate] Skipping - email already sent in afterCreate for ${result.id}`);
            emailAlreadySentForCreate.delete(result.id); // Clean up to prevent memory leak
            return;
        }

        const data = params?.data;

        // この更新が管理者によるステータス変更によるものか確認する
        // 自動承認による初期作成ではない
        const isManualStatusChange = data?.confirmedAt || data?.canceledAt;

        // Additional check: Look at the createdAt vs updatedAt to detect if this
        // is essentially the same moment (creation with auto-confirm)
        const createdAt = new Date(result.createdAt).getTime();
        const updatedAt = new Date(result.updatedAt).getTime();
        const timeDiffMs = updatedAt - createdAt;

        // If updated within 5 seconds of creation, treat as part of creation flow
        const isPartOfCreation = timeDiffMs < 5000;

        const newStatus = result.status;
        console.log(`[Lifecycle:afterUpdate] ID=${result.id} Status=${newStatus} ManualChange=${!!isManualStatusChange} TimeDiff=${timeDiffMs}ms`);

        if (!result.email) {
            return;
        }

        // Skip if this looks like part of the creation flow
        if (isPartOfCreation && newStatus === 'confirmed') {
            console.log(`[Lifecycle:afterUpdate] Skipping email - appears to be part of creation flow`);
            return;
        }

        if (!isManualStatusChange) {
            strapi.log.info('[Lifecycle:afterUpdate] No confirmedAt/canceledAt in update data, skipping email');
            return;
        }

        // --- DEBOUNCE LOGIC ---
        const dedupKey = `${result.id}:${newStatus}`;
        const now = Date.now();
        const lastSent = emailSentHistory.get(dedupKey);

        // If sent within last 10 seconds, skip
        if (lastSent && (now - lastSent < 10000)) {
            console.log(`[Lifecycle:afterUpdate] DUPLICATE DETECTED. Skipping email for ${dedupKey}. Last sent ${(now - lastSent)}ms ago.`);
            return;
        }
        // ----------------------

        try {
            // 予約データを店舗情報付きで再取得
            const reservationWithStore = await strapi.entityService.findOne(
                'api::reservation.reservation',
                result.id,
                { populate: ['store'] }
            ) as any;

            const store = reservationWithStore?.store;

            if (!store) {
                strapi.log.warn('[Lifecycle:afterUpdate] Store not found for reservation:', result.id);
                return;
            }

            // ステータスに応じてメール送信
            let sent = false;
            let emailResult: any = null;

            // 返信の自動翻訳 (Ticket-10)
            let ownerReplyTranslated = null;

            // Debug Log for Translation
            if (params.data.ownerReply) {
                strapi.log.info(`[Lifecycle:afterUpdate] Translation check: OwnerReply present. Language=${reservationWithStore.language}`);
            }

            if (params.data.ownerReply && reservationWithStore.language && reservationWithStore.language !== 'ja') {
                // Feature: Frontend might have already combined translation and original.
                // Check if the message contains the separator (e.g., "---" or "(Original")
                const replyText = params.data.ownerReply;
                const isAlreadyCombined = replyText.includes('---') || replyText.includes('(Original');

                if (isAlreadyCombined) {
                    strapi.log.info(`[Lifecycle:afterUpdate] Skipping translation - message appears to be already translated/combined.`);
                } else {
                    try {
                        const { TranslationService } = require('../../../../core/services/translation');

                        strapi.log.info(`[Lifecycle:afterUpdate] Attempting translation to ${reservationWithStore.language}...`);
                        ownerReplyTranslated = await TranslationService.translate(params.data.ownerReply, reservationWithStore.language);
                        strapi.log.info(`[Lifecycle:afterUpdate] Owner reply translated: ${ownerReplyTranslated}`);
                    } catch (e) {
                        strapi.log.error('[Lifecycle:afterUpdate] Owner reply translation failed:', e);
                    }
                }
            }

            // 翻訳結果をreservationオブジェクトに注入
            if (ownerReplyTranslated) {
                (reservationWithStore as any).ownerReplyTranslated = ownerReplyTranslated;
            }

            // [Fix] Ensure the email uses the latest ownerReply from the update params
            // DB fetch might sometimes miss the inflight update in certain transaction isolations
            // or if the update specifically targeted ownerReply.
            if (params.data.ownerReply) {
                reservationWithStore.ownerReply = params.data.ownerReply;
            }

            if (newStatus === 'confirmed') {
                console.log(`[Lifecycle:afterUpdate] Sending CONFIRMED email for ${result.id}`);
                emailResult = await strapi.service('api::reservation.email').sendReservationEmail(
                    reservationWithStore,
                    store,
                    'confirmed'
                );
                sent = true;
            } else if (newStatus === 'rejected' || newStatus === 'canceled') {
                console.log(`[Lifecycle:afterUpdate] Sending CANCELLED email for ${result.id}`);
                emailResult = await strapi.service('api::reservation.email').sendReservationEmail(
                    reservationWithStore,
                    store,
                    'cancelled' // Template name might still be 'cancelled'? Check email service or keep as checks
                );
                sent = true;
            }

            // DBにステータスを保存 (Logging)
            if (emailResult) {
                const emailStatus = emailResult.success ? 'sent' : 'failed';
                const emailError = emailResult.error || null;

                if (!emailResult.success) {
                    strapi.log.error(`[Lifecycle:afterUpdate] Email failed for ${result.id}: ${emailError}`);
                } else {
                    strapi.log.info(`[Lifecycle:afterUpdate] Email sent for ${result.id}`);
                }

                await strapi.db.query('api::reservation.reservation').update({
                    where: { id: result.id },
                    data: { emailStatus, emailError }
                });
            }

            // Record timestamp if email was sent
            if (sent) {
                emailSentHistory.set(dedupKey, now);
                // Optional: Clean up old entries
                if (emailSentHistory.size > 1000) {
                    emailSentHistory.clear(); // Simple cleanup strategy
                }
            }

        } catch (error) {
            console.error('[Lifecycle:afterUpdate] Error:', error);
            strapi.log.error('Failed to send status change email:', error);
        }
    },
};
