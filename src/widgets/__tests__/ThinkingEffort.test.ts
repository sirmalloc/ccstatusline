import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Mock } from 'vitest';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type {
    RenderContext,
    StatusJSON,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { loadClaudeSettingsSync } from '../../utils/claude-settings';
import { ThinkingEffortWidget } from '../ThinkingEffort';

// Mock claude-settings to avoid filesystem reads in tests
vi.mock('../../utils/claude-settings', () => ({ loadClaudeSettingsSync: vi.fn() }));

const mockedLoadSettings = loadClaudeSettingsSync as Mock;
const MODEL_WITH_HIGH_EFFORT = '<local-command-stdout>Set model to \u001b[1mopus (claude-opus-4-6)\u001b[22m with \u001b[1mhigh\u001b[22m effort</local-command-stdout>';
const MODEL_WITH_LOW_EFFORT = '<local-command-stdout>Set model to \u001b[1msonnet (claude-sonnet-4-5)\u001b[22m with \u001b[1mlow\u001b[22m effort</local-command-stdout>';
const MODEL_WITH_MAX_EFFORT = '<local-command-stdout>Set model to \u001b[1mopus (claude-opus-4-6)\u001b[22m with \u001b[1mmax\u001b[22m effort</local-command-stdout>';
const MODEL_WITH_XHIGH_EFFORT = '<local-command-stdout>Set model to \u001b[1mopus (claude-opus-4-7)\u001b[22m with \u001b[1mxhigh\u001b[22m effort</local-command-stdout>';
const MODEL_WITH_XHIGH_MIXED_CASE_EFFORT = '<local-command-stdout>Set model to \u001b[1mopus (claude-opus-4-7)\u001b[22m with \u001b[1mxHigh\u001b[22m effort</local-command-stdout>';
const MODEL_WITH_SUPER_MAX_EFFORT = '<local-command-stdout>Set model to \u001b[1mopus (claude-opus-4-8)\u001b[22m with \u001b[1msuper-max\u001b[22m effort</local-command-stdout>';
const MODEL_WITH_SUPER_MAX_MIXED_CASE_EFFORT = '<local-command-stdout>Set model to \u001b[1mopus (claude-opus-4-8)\u001b[22m with \u001b[1mSuper-Max\u001b[22m effort</local-command-stdout>';
const MODEL_WITHOUT_EFFORT = '<local-command-stdout>Set model to \u001b[1msonnet (claude-sonnet-4-5)\u001b[22m</local-command-stdout>';

let tempDir: string;

function makeTranscriptEntry(content: string): string {
    return JSON.stringify({
        type: 'user',
        message: {
            role: 'user',
            content
        }
    });
}

function render(options: {
    transcriptPath?: string;
    fileContent?: string | null | undefined;
    rawValue?: boolean;
    isPreview?: boolean;
    statusData?: Partial<StatusJSON>;
    settingsValue?: unknown;
} = {}): string | null {
    const {
        transcriptPath = options.fileContent !== undefined ? path.join(tempDir, 'session.jsonl') : undefined,
        fileContent,
        rawValue = false,
        isPreview = false,
        statusData = {},
        settingsValue = {}
    } = options;

    const widget = new ThinkingEffortWidget();
    const data: Partial<StatusJSON> = {
        ...statusData,
        ...(transcriptPath ? { transcript_path: transcriptPath } : {})
    };
    const context: RenderContext = {
        data: Object.keys(data).length > 0 ? data : undefined,
        isPreview
    };
    const item: WidgetItem = {
        id: 'thinking-effort',
        type: 'thinking-effort',
        rawValue
    };

    mockedLoadSettings.mockReturnValue(settingsValue as never);

    if (transcriptPath && fileContent !== undefined && fileContent !== null) {
        fs.writeFileSync(transcriptPath, fileContent, 'utf-8');
    }

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('ThinkingEffortWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-thinking-effort-'));
        mockedLoadSettings.mockReturnValue({} as never);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('metadata', () => {
        it('has correct display name', () => {
            const widget = new ThinkingEffortWidget();
            expect(widget.getDisplayName()).toBe('Thinking Effort');
        });

        it('has correct category', () => {
            const widget = new ThinkingEffortWidget();
            expect(widget.getCategory()).toBe('Core');
        });

        it('supports raw value', () => {
            const widget = new ThinkingEffortWidget();
            expect(widget.supportsRawValue()).toBe(true);
        });

        it('supports colors', () => {
            const widget = new ThinkingEffortWidget();
            expect(widget.supportsColors({ type: 'thinking-effort' } as never)).toBe(true);
        });
    });

    describe('preview mode', () => {
        it('returns labelled preview', () => {
            const result = render({ isPreview: true });
            expect(result).toBe('Thinking: high');
        });

        it('returns raw preview', () => {
            const result = render({ isPreview: true, rawValue: true });
            expect(result).toBe('high');
        });
    });

    describe('status JSON source', () => {
        it('reads max effort from status JSON', () => {
            const result = render({ statusData: { effort: { level: 'max' } } });
            expect(result).toBe('Thinking: max');
        });

        it('returns raw status JSON effort when requested', () => {
            const result = render({
                rawValue: true,
                statusData: { effort: { level: 'max' } }
            });
            expect(result).toBe('max');
        });

        it('prefers status JSON effort over transcript and settings fallbacks', () => {
            const result = render({
                fileContent: makeTranscriptEntry(MODEL_WITH_HIGH_EFFORT),
                settingsValue: { effortLevel: 'low' },
                statusData: { effort: { level: 'max' } }
            });
            expect(result).toBe('Thinking: max');
        });

        it('supports xhigh effort from status JSON', () => {
            const result = render({ statusData: { effort: { level: 'xhigh' } } });
            expect(result).toBe('Thinking: xhigh');
        });

        it('shows unknown-but-valid status JSON effort with trailing "?" marker', () => {
            const result = render({ statusData: { effort: { level: 'ultra' } } });
            expect(result).toBe('Thinking: ultra?');
        });

        it('treats null status JSON effort as explicit default', () => {
            const result = render({
                fileContent: makeTranscriptEntry(MODEL_WITH_HIGH_EFFORT),
                settingsValue: { effortLevel: 'low' },
                statusData: { effort: { level: null } }
            });
            expect(result).toBe('Thinking: default');
        });
    });

    describe('transcript source', () => {
        it('reads effort from the latest /model transcript stdout', () => {
            const result = render({
                fileContent: makeTranscriptEntry(MODEL_WITH_HIGH_EFFORT),
                settingsValue: { effortLevel: 'low' }
            });
            expect(result).toBe('Thinking: high');
        });

        it('returns raw transcript effort when requested', () => {
            const result = render({
                fileContent: makeTranscriptEntry(MODEL_WITH_LOW_EFFORT),
                rawValue: true
            });
            expect(result).toBe('low');
        });

        it('supports max effort from transcript output', () => {
            const result = render({ fileContent: makeTranscriptEntry(MODEL_WITH_MAX_EFFORT) });
            expect(result).toBe('Thinking: max');
        });

        it('supports xhigh effort from transcript output', () => {
            const result = render({ fileContent: makeTranscriptEntry(MODEL_WITH_XHIGH_EFFORT) });
            expect(result).toBe('Thinking: xhigh');
        });

        it('supports mixed-case xHigh effort from transcript output', () => {
            const result = render({ fileContent: makeTranscriptEntry(MODEL_WITH_XHIGH_MIXED_CASE_EFFORT) });
            expect(result).toBe('Thinking: xhigh');
        });

        it('shows unknown-but-valid effort with trailing "?" marker', () => {
            const result = render({ fileContent: makeTranscriptEntry(MODEL_WITH_SUPER_MAX_EFFORT) });
            expect(result).toBe('Thinking: super-max?');
        });

        it('lowercases and marks mixed-case unknown effort', () => {
            const result = render({ fileContent: makeTranscriptEntry(MODEL_WITH_SUPER_MAX_MIXED_CASE_EFFORT) });
            expect(result).toBe('Thinking: super-max?');
        });

        it('does not keep stale transcript effort when a newer /model output has no effort', () => {
            const result = render({
                fileContent: [
                    makeTranscriptEntry(MODEL_WITH_HIGH_EFFORT),
                    makeTranscriptEntry('<local-command-stdout>Bye!</local-command-stdout>'),
                    makeTranscriptEntry(MODEL_WITHOUT_EFFORT)
                ].join('\n'),
                settingsValue: { effortLevel: 'medium' }
            });
            expect(result).toBe('Thinking: medium');
        });
    });

    describe('Claude settings fallback', () => {
        it('falls back to effortLevel when the latest /model output has no effort', () => {
            const result = render({
                fileContent: makeTranscriptEntry(MODEL_WITHOUT_EFFORT),
                settingsValue: { effortLevel: 'high' }
            });
            expect(result).toBe('Thinking: high');
        });

        it('falls back to effortLevel when the transcript is unavailable', () => {
            const result = render({
                transcriptPath: path.join(tempDir, 'missing.jsonl'),
                fileContent: null,
                settingsValue: { effortLevel: 'high' }
            });
            expect(result).toBe('Thinking: high');
        });

        it('handles case-insensitive effortLevel', () => {
            const result = render({ settingsValue: { effortLevel: 'HIGH' } });
            expect(result).toBe('Thinking: high');
        });

        it('supports max effortLevel', () => {
            const result = render({ settingsValue: { effortLevel: 'max' } });
            expect(result).toBe('Thinking: max');
        });

        it('supports xhigh effortLevel', () => {
            const result = render({ settingsValue: { effortLevel: 'xhigh' } });
            expect(result).toBe('Thinking: xhigh');
        });

        it('supports mixed-case xHigh effortLevel', () => {
            const result = render({ settingsValue: { effortLevel: 'xHigh' } });
            expect(result).toBe('Thinking: xhigh');
        });

        it('shows unknown-but-valid effortLevel with trailing "?" marker', () => {
            const result = render({ settingsValue: { effortLevel: 'super-max' } });
            expect(result).toBe('Thinking: super-max?');
        });

        it('marks unknown effortLevel still passes through case-insensitive match', () => {
            const result = render({ settingsValue: { effortLevel: 'Ultra' } });
            expect(result).toBe('Thinking: ultra?');
        });

        it('displays default when effortLevel is not set', () => {
            const result = render();
            expect(result).toBe('Thinking: default');
        });

        it('displays default when effortLevel fails the shape check', () => {
            const result = render({ settingsValue: { effortLevel: 'has space' } });
            expect(result).toBe('Thinking: default');
        });

        it('displays default when effortLevel is too long', () => {
            const result = render({ settingsValue: { effortLevel: 'thisisaveryverylongeffortname' } });
            expect(result).toBe('Thinking: default');
        });

        it('displays default when effortLevel is a single character', () => {
            const result = render({ settingsValue: { effortLevel: 'x' } });
            expect(result).toBe('Thinking: default');
        });

        it('displays default when settings read fails', () => {
            mockedLoadSettings.mockImplementation(() => {
                throw new Error('settings unavailable');
            });
            const result = render();
            expect(result).toBe('Thinking: default');
        });

        it('displays default when the latest /model output has no effort and settings are missing', () => {
            const result = render({ fileContent: makeTranscriptEntry(MODEL_WITHOUT_EFFORT) });
            expect(result).toBe('Thinking: default');
        });

        it('displays raw default when fallback hits', () => {
            const result = render({ rawValue: true });
            expect(result).toBe('default');
        });
    });
});
