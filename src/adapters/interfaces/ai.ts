
export interface AIResult {
    text: string;
    raw?: any;
}

export interface AIAdapter {
    /**
     * Analyze text notes using AI.
     * @param text The text to analyze
     */
    analyzeNotes(text: string): Promise<AIResult>;
}
