import { getVisibleText } from './ansi';
import {
    iterateJsonlLinesReverseSync,
    parseJsonlLine
} from './jsonl-lines';

const KNOWN_THINKING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const KNOWN_THINKING_EFFORTS_SET: ReadonlySet<string> = new Set(KNOWN_THINKING_EFFORTS);
export type TranscriptThinkingEffort = typeof KNOWN_THINKING_EFFORTS[number];

export interface ResolvedThinkingEffort {
    value: string;
    known: boolean;
}

const MODEL_STDOUT_PREFIX = '<local-command-stdout>Set model to ';
const MODEL_STDOUT_EFFORT_REGEX = /^<local-command-stdout>Set model to[\s\S]*? with ([a-zA-Z0-9-]+) effort<\/local-command-stdout>$/i;
const EFFORT_STDOUT_PREFIX = '<local-command-stdout>Set effort level to ';
const EFFORT_STDOUT_REGEX = /^<local-command-stdout>Set effort level to ([a-zA-Z0-9-]+)\b/i;
const UNKNOWN_EFFORT_PATTERN = /^(?=.*[a-z0-9])[a-z0-9-]{2,20}$/;

interface TranscriptEntry { message?: { content?: string } }

export interface ThinkingEffortUpdate { effort: ResolvedThinkingEffort | undefined }

export function normalizeThinkingEffort(value: string | undefined): ResolvedThinkingEffort | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.toLowerCase();
    if (KNOWN_THINKING_EFFORTS_SET.has(normalized)) {
        return { value: normalized, known: true };
    }

    if (UNKNOWN_EFFORT_PATTERN.test(normalized)) {
        return { value: normalized, known: false };
    }

    return undefined;
}

/**
 * Returns an update when a transcript record authoritatively changes the
 * effort level. A /model result without an effort clears an older transcript
 * value, matching the reverse-search behavior used by the widget fallback.
 */
export function getThinkingEffortUpdate(record: unknown): ThinkingEffortUpdate | null {
    const entry = record as TranscriptEntry | null;
    if (typeof entry?.message?.content !== 'string') {
        return null;
    }

    const content = entry.message.content;
    if (!content.includes(EFFORT_STDOUT_PREFIX) && !content.includes(MODEL_STDOUT_PREFIX)) {
        return null;
    }

    const visibleContent = getVisibleText(content).trim();
    if (visibleContent.startsWith(EFFORT_STDOUT_PREFIX)) {
        const effortMatch = EFFORT_STDOUT_REGEX.exec(visibleContent);
        return effortMatch ? { effort: normalizeThinkingEffort(effortMatch[1]) } : null;
    }

    if (!visibleContent.startsWith(MODEL_STDOUT_PREFIX)) {
        return null;
    }

    const match = MODEL_STDOUT_EFFORT_REGEX.exec(visibleContent);
    return { effort: normalizeThinkingEffort(match?.[1]) };
}

export function getTranscriptThinkingEffort(transcriptPath: string | undefined): ResolvedThinkingEffort | undefined {
    if (!transcriptPath) {
        return undefined;
    }

    try {
        for (const line of iterateJsonlLinesReverseSync(transcriptPath)) {
            const update = getThinkingEffortUpdate(parseJsonlLine(line));
            if (update) {
                return update.effort;
            }
        }
    } catch {
        return undefined;
    }

    return undefined;
}
