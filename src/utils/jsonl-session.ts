import {
    iterateJsonlLinesReverseSync,
    parseJsonlLine
} from './jsonl-lines';

export function getSessionNameFromRecord(
    record: unknown,
    type: 'custom-title' | 'ai-title' = 'custom-title'
): string | null {
    if (typeof record !== 'object' || record === null) {
        return null;
    }

    const entry = record as { type?: unknown; customTitle?: unknown; aiTitle?: unknown };
    const title = type === 'custom-title' ? entry.customTitle : entry.aiTitle;
    return entry.type === type && typeof title === 'string' && title.length > 0
        ? title
        : null;
}

export function getTranscriptSessionName(transcriptPath: string | undefined): string | null {
    if (!transcriptPath) {
        return null;
    }

    let automaticTitle: string | null = null;
    try {
        for (const line of iterateJsonlLinesReverseSync(transcriptPath)) {
            const record = parseJsonlLine(line);
            const sessionName = getSessionNameFromRecord(record);
            if (sessionName !== null) {
                return sessionName;
            }
            automaticTitle ??= getSessionNameFromRecord(record, 'ai-title');
        }
    } catch {
        return null;
    }

    return automaticTitle;
}
