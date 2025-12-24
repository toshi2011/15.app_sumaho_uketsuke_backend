/**
 * Reservation ライフサイクルフック
 * ステータス変更時に自動メール送信
 */

// afterCreate後にメールが送信済みである予約を追跡する
// afterUpdateからの重複送信を防ぐため
const emailAlreadySentForCreate = new Set<number>();
// const emailAlreadySentForCreate = new Set<number>(); // This line is removed as per the instruction

// Email deduplication history for afterUpdate
// Key: `${reservationId}:${status}`
// Value: timestamp
const emailSentHistory = new Map<string, number>();

// Global set to track email sent for specific ID (Session duration)
const emailSentSession = new Set<string>();

export default {
    async afterCreate(event) {
        const { result } = event;
        // console.log(`[Lifecycle:afterCreate] ID=${result.id} Status=${result.status}`);
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
            if (result.status === 'pending') {
                console.log(`[Lifecycle:afterCreate] Sending PENDING email for ${result.id}`);
                // 仮受付メール
                await strapi.service('api::reservation.email').sendReservationEmail(
                    reservationWithStore,
                    store,
                    'pending'
                );
                strapi.log.info(`[Lifecycle:afterCreate] Pending email sent for reservation ${result.id}`);
                // Mark this reservation as having email sent
                emailAlreadySentForCreate.add(result.id);
                // Also add to debounce history
                const dedupKey = `${result.id}:pending`;
                emailSentHistory.set(dedupKey, Date.now());
            } else if (result.status === 'confirmed') {
                console.log(`[Lifecycle:afterCreate] Sending CONFIRMED email for ${result.id} (auto-approved)`);
                // 自動確定の場合は確定メール
                await strapi.service('api::reservation.email').sendReservationEmail(
                    reservationWithStore,
                    store,
                    'confirmed'
                );
                strapi.log.info(`[Lifecycle:afterCreate] Confirmation email sent for auto-approved reservation ${result.id}`);
                // Mark this reservation as having email sent
                emailAlreadySentForCreate.add(result.id);
                // Also add to debounce history to protect against immediate updates
                const dedupKey = `${result.id}:confirmed`;
                emailSentHistory.set(dedupKey, Date.now());
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

        // Check if this update is from a status change by the admin
        // Not from the initial creation with auto-confirm
        const isManualStatusChange = data?.confirmedAt || data?.cancelledAt;

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
            strapi.log.info('[Lifecycle:afterUpdate] No confirmedAt/cancelledAt in update data, skipping email');
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
            if (newStatus === 'confirmed') {
                console.log(`[Lifecycle:afterUpdate] Sending CONFIRMED email for ${result.id}`);
                await strapi.service('api::reservation.email').sendReservationEmail(
                    reservationWithStore,
                    store,
                    'confirmed'
                );
                strapi.log.info(`[Lifecycle:afterUpdate] Confirmation email sent for reservation ${result.id}`);
                sent = true;
            } else if (newStatus === 'rejected' || newStatus === 'cancelled') {
                console.log(`[Lifecycle:afterUpdate] Sending CANCELLED email for ${result.id}`);
                await strapi.service('api::reservation.email').sendReservationEmail(
                    reservationWithStore,
                    store,
                    'cancelled'
                );
                strapi.log.info(`[Lifecycle:afterUpdate] Cancellation email sent for reservation ${result.id}`);
                sent = true;
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
