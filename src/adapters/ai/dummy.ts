
import { AIAdapter, AIResult } from '../interfaces/ai';

export class DummyAIAdapter implements AIAdapter {
    async analyzeNotes(text: string): Promise<AIResult> {
        return {
            text: `[Dummy AI Analysis] Processed: ${text.substring(0, 20)}... (Analysis functionality pending)`,
        };
    }
}
