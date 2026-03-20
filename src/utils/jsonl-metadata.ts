import { getVisibleText } from './ansi';
import {
    parseJsonlLine,
    readJsonlLinesSync
} from './jsonl-lines';

export type TranscriptThinkingEffort = 'low' | 'medium' | 'high' | 'max';

const MODEL_STDOUT_PREFIX = '<local-command-stdout>Set model to ';
const MODEL_STDOUT_EFFORT_REGEX = /^<local-command-stdout>Set model to[\s\S]*? with (low|medium|high|max) effort<\/local-command-stdout>$/i;
const EFFORT_STDOUT_PREFIX = '<local-command-stdout>Set effort level to ';
const EFFORT_STDOUT_REGEX = /^<local-command-stdout>Set effort level to (low|medium|high|max)\b/i;

interface TranscriptEntry { message?: { content?: string } }

function normalizeThinkingEffort(value: string | undefined): TranscriptThinkingEffort | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.toLowerCase();
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'max') {
        return normalized;
    }

    return undefined;
}

export function getTranscriptThinkingEffort(transcriptPath: string | undefined): TranscriptThinkingEffort | undefined {
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