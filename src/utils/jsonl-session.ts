import {
    iterateJsonlLinesReverseSync,
    parseJsonlLine
} from './jsonl-lines';

export function getSessionNameFromRecord(record: unknown): string | null {
    if (typeof record !== 'object' || record === null) {
        return null;
    }

    const entry = record as { type?: unknown; customTitle?: unknown };
    return entry.type === 'custom-title' && typeof entry.customTitle === 'string' && entry.customTitle.length > 0
        ? entry.customTitle
        : null;
}

export function getTranscriptSessionName(transcriptPath: string | undefined): string | null {
    if (!transcriptPath) {
        return null;
    }

    try {
        for (const line of iterateJsonlLinesReverseSync(transcriptPath)) {
            const sessionName = getSessionNameFromRecord(parseJsonlLine(line));
            if (sessionName !== null) {
                return sessionName;
            }
        }
    } catch {
        return null;
    }

    return null;
}
