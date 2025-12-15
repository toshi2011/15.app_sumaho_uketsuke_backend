
export interface EmailResult {
    success: boolean;
    messageId?: string;
    previewUrl?: string; // For development (Ethereal)
    mock?: boolean;
    error?: string;
}

export interface EmailAdapter {
    /**
     * Send an email.
     * @param to Recipient email address
     * @param subject Email subject
     * @param htmlBody Email body in HTML format
     */
    sendMail(to: string, subject: string, htmlBody: string): Promise<EmailResult>;
}
