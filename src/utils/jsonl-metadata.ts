import { getVisibleText } from './ansi';
import {
    parseJsonlLine,
    readJsonlLinesSync
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

export function getTranscriptThinkingEffort(transcriptPath: string | undefined): ResolvedThinkingEffort | undefined {
    if (!transcriptPath) {
        return undefined;
    }

    try {
        const lines = readJsonlLinesSync(transcriptPath);

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            if (!line) {
                continue;
            }

            const entry = parseJsonlLine(line) as TranscriptEntry | null;
            if (typeof entry?.message?.content !== 'string') {
                continue;
            }

            const visibleContent = getVisibleText(entry.message.content).trim();

            if (visibleContent.startsWith(EFFORT_STDOUT_PREFIX)) {
                const effortMatch = EFFORT_STDOUT_REGEX.exec(visibleContent);
                if (effortMatch) {
                    return normalizeThinkingEffort(effortMatch[1]);
                }
            }

            if (!visibleContent.startsWith(MODEL_STDOUT_PREFIX)) {
                continue;
            }

            const match = MODEL_STDOUT_EFFORT_REGEX.exec(visibleContent);
            return normalizeThinkingEffort(match?.[1]);
        }
    } catch {
        return undefined;
    }

    return undefined;
}
