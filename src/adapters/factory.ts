
import { EmailAdapter } from './interfaces/email';
import { AIAdapter } from './interfaces/ai';
import { LocalEmailAdapter } from './email/local';
import { DummyAIAdapter } from './ai/dummy';

export class AdapterFactory {
    private static emailAdapter: EmailAdapter;
    private static aiAdapter: AIAdapter;

    /**
     * Get the configured EmailAdapter instance.
     */
    static getEmailAdapter(): EmailAdapter {
        if (!this.emailAdapter) {
            // In the future, we can check process.env to decide which adapter to load
            this.emailAdapter = new LocalEmailAdapter();
        }
        return this.emailAdapter;
    }

    /**
     * Get the configured AIAdapter instance.
     */
    static getAIAdapter(): AIAdapter {
        if (!this.aiAdapter) {
            this.aiAdapter = new DummyAIAdapter();
        }
        return this.aiAdapter;
    }
}
