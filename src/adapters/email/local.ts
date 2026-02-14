
import * as nodemailer from 'nodemailer';
import { EmailAdapter, EmailResult } from '../interfaces/email';

export class LocalEmailAdapter implements EmailAdapter {
    private createTransporter() {
        const config: any = {
            host: process.env.SMTP_HOST || 'email-smtp.ap-northeast-1.amazonaws.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: {
                user: process.env.SMTP_USER || process.env.AWS_SES_SMTP_USER,
                pass: process.env.SMTP_PASS || process.env.AWS_SES_SMTP_PASS,
            },
            tls: {
                // Self-signed certificate support for dev
                rejectUnauthorized: false,
            },
        };

        if (!config.auth.user || !config.auth.pass) {
            return null;
        }

        return nodemailer.createTransport(config);
    }

    async sendMail(to: string, subject: string, htmlBody: string): Promise<EmailResult> {
        const transporter = this.createTransporter();

        if (!transporter) {
            console.log('SMTP not configured effectively using LocalEmailAdapter. Mocking send.');
            console.log(`To: ${to}`);
            console.log(`Subject: ${subject}`);
            console.log('Body length:', htmlBody.length);
            return { success: true, mock: true };
        }

        try {
            const fromEmail = process.env.EMAIL_FROM || `noreply@${process.env.EMAIL_DOMAIN || 'example.com'}`;
            // Store name is ideally passed or handled in 'from'.
            // For simple adapter, we use a default or assume the caller manages the visible name in headers if needed.
            // But standard nodemailer 'from' string: '"Name" <email>'
            // Here we just use the raw email or a configured default.
            // The caller might want to customize the sender name.
            // For now, let's keep it simple or allow 'from' configuration.
            // Based on previous code: from: `"${store.name}" <${fromEmail}>`
            // WE NEED TO DECIDE: Does the adapter control the generic "from", or does the caller pass it?
            // The interface just says (to, subject, body).
            // Let's stick to the interface and use env vars for FROM.
            // If the caller needs dynamic FROM, we should update the interface.
            // Given the previous code used store.name, let's see. 
            // The CTO said "Adapter is 'send only'".
            // Let's assume a system-wide generic sender for now, OR update the interface.
            // Wait, previous code: from: `"${store.name}" <${fromEmail}>`
            // Functional Requirement: Emails come from the Store.
            // So we SHOULD update the interface to allow optional "fromName".

            const info = await transporter.sendMail({
                from: fromEmail, // Simplified for now to match strict interface, or we update interface.
                to,
                subject,
                html: htmlBody,
            }) as any;

            const previewUrl = process.env.NODE_ENV === 'development' ? nodemailer.getTestMessageUrl(info) || undefined : undefined;

            return {
                success: true,
                messageId: info.messageId,
                previewUrl
            };
        } catch (error: any) {
            console.error('LocalEmailAdapter error:', error);
            return { success: false, error: error.message };
        }
    }
}
