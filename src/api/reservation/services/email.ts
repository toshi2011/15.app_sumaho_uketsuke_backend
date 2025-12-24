/**
 * メール送信サービス (Strapi Service)
 * INF-300/301 実装
 * 
 * NOTE: This file re-exports the core email service to be accessible via 'api::reservation.email'.
 */

import emailService from '../../../core/services/reservation-email';

export default emailService;
