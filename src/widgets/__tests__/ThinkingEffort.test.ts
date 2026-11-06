import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { MockInstance } from 'vitest';
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
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import * as claudeSettings from '../../utils/claude-settings';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../../utils/renderer';
import { ThinkingEffortWidget } from '../ThinkingEffort';

// Stub the settings read to avoid filesystem reads in tests. vi.spyOn on the
// module namespace rather than vi.mock('../../utils/claude-settings', ...): a
// factory-based vi.mock is not file-scoped under this test runner, and when
// claude-settings.test.ts ran later in the same invocation, its own
// loadClaudeSettingsSync tests got this file's stub instead of the real one.
let mockedLoadSettings: MockInstance<typeof claudeSettings.loadClaudeSettingsSync>;
const MODEL_WITH_HIGH_EFFORT = '<local-command-stdout>Set model to \u001b[1mopus (claude-opus-4-6)\u001b[22m with \u001b[1mhigh\u001b[22m effort</local-command-stdout>';
const MODEL_WITH_LOW_EFFORT = '<local-command-stdout>Set model to \u001b[1msonnet (claude-sonnet-4-5)\u001b[22m with \u001b[1mlow\u001b[22m effort</local-command-stdout>';
const MODEL_WITH_MAX_EFFORT = '<local-command-stdout>Set model to \u001b[1mopus (claude-opus-4-6)\u001b[22m with \u001b[1mmax\u001b[22m effort</local-command-stdout>';
const MODEL_WITH_XHIGH_EFFORT = '<local-command-stdout>Set model to \u001b[1mopus (claude-opus-4-7)\u001b[22m with \u001b[1mxhigh\u001b[22m effort</local-command-stdout>';
const MODEL_WITH_XHIGH_MIXED_CASE_EFFORT = '<local-command-stdout>Set model to \u001b[1mopus (claude-opus-4-7)\u001b[22m with \u001b[1mxHigh\u001b[22m effort</local-command-stdout>';
const MODEL_WITH_SUPER_MAX_EFFORT = '<local-command-stdout>Set model to \u001b[1mopus (claude-opus-4-8)\u001b[22m with \u001b[1msuper-max\u001b[22m effort</local-command-stdout>';
const MODEL_WITH_SUPER_MAX_MIXED_CASE_EFFORT = '<local-command-stdout>Set model to \u001b[1mopus (claude-opus-4-8)\u001b[22m with \u001b[1mSuper-Max\u001b[22m effort</local-command-stdout>';
const MODEL_WITHOUT_EFFORT = '<local-command-stdout>Set model to \u001b[1msonnet (claude-sonnet-4-5)\u001b[22m</local-command-stdout>';
const EFFORT_HIGH = '<local-command-stdout>Set effort level to \u001b[1mhigh\u001b[22m: Comprehensive implementation with extensive testing and documentation</local-command-stdout>';
const EFFORT_LOW = '<local-command-stdout>Set effort level to \u001b[1mlow\u001b[22m: Quick, minimal-effort response</local-command-stdout>';
const EFFORT_MEDIUM = '<local-command-stdout>Set effort level to \u001b[1mmedium\u001b[22m: Balanced response with good coverage</local-command-stdout>';
const EFFORT_MAX = '<local-command-stdout>Set effort level to \u001b[1mmax\u001b[22m (this session only): Maximum capability with deepest reasoning (Opus 4.6 only)</local-command-stdout>';

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
    transcriptThinkingEffort?: RenderContext['transcriptThinkingEffort'];
    item?: Partial<WidgetItem>;
    settings?: Partial<Settings>;
} = {}): string | null {
    const {
        transcriptPath = options.fileContent !== undefined ? path.join(tempDir, 'session.jsonl') : undefined,
        fileContent,
        rawValue = false,
        isPreview = false,
        statusData = {},
        settingsValue = {},
        transcriptThinkingEffort,
        item: itemOverrides = {},
        settings = {}
    } = options;

    const widget = new ThinkingEffortWidget();
    const data: Partial<StatusJSON> = {
        ...statusData,
        ...(transcriptPath ? { transcript_path: transcriptPath } : {})
    };
    const context: RenderContext = {
        data: Object.keys(data).length > 0 ? data : undefined,
        isPreview,
        transcriptThinkingEffort
    };
    const item: WidgetItem = {
        id: 'thinking-effort',
        type: 'thinking-effort',
        rawValue,
        ...itemOverrides
    };

    mockedLoadSettings.mockReturnValue(settingsValue as ReturnType<typeof claudeSettings.loadClaudeSettingsSync>);

    if (transcriptPath && fileContent !== undefined && fileContent !== null) {
        fs.writeFileSync(transcriptPath, fileContent, 'utf-8');
    }

    return widget.render(item, context, { ...DEFAULT_SETTINGS, ...settings });
}

describe('ThinkingEffortWidget', () => {
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-thinking-effort-'));
        mockedLoadSettings = vi.spyOn(claudeSettings, 'loadClaudeSettingsSync').mockReturnValue({});
    });

    afterEach(() => {
        vi.restoreAllMocks();
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

        it('uses effort precomputed by the shared transcript analysis', () => {
            const result = render({
                transcriptPath: path.join(tempDir, 'missing.jsonl'),
                transcriptThinkingEffort: { value: 'high', known: true },
                settingsValue: { effortLevel: 'low' }
            });

            expect(result).toBe('Thinking: high');
        });
    });

    describe('/effort command source', () => {
        it('reads effort from /effort transcript stdout', () => {
            const result = render({ fileContent: makeTranscriptEntry(EFFORT_HIGH) });
            expect(result).toBe('Thinking: high');
        });

        it('supports low effort from /effort command', () => {
            const result = render({ fileContent: makeTranscriptEntry(EFFORT_LOW) });
            expect(result).toBe('Thinking: low');
        });

        it('supports medium effort from /effort command', () => {
            const result = render({ fileContent: makeTranscriptEntry(EFFORT_MEDIUM) });
            expect(result).toBe('Thinking: medium');
        });

        it('supports max effort from /effort command', () => {
            const result = render({ fileContent: makeTranscriptEntry(EFFORT_MAX) });
            expect(result).toBe('Thinking: max');
        });

        it('returns raw effort from /effort command', () => {
            const result = render({ fileContent: makeTranscriptEntry(EFFORT_HIGH), rawValue: true });
            expect(result).toBe('high');
        });

        it('/effort overrides earlier /model when it is newer', () => {
            const result = render({
                fileContent: [
                    makeTranscriptEntry(MODEL_WITH_LOW_EFFORT),
                    makeTranscriptEntry(EFFORT_MAX)
                ].join('\n')
            });
            expect(result).toBe('Thinking: max');
        });

        it('/model overrides earlier /effort when it is newer', () => {
            const result = render({
                fileContent: [
                    makeTranscriptEntry(EFFORT_MAX),
                    makeTranscriptEntry(MODEL_WITH_LOW_EFFORT)
                ].join('\n')
            });
            expect(result).toBe('Thinking: low');
        });

        it('/effort overrides settings fallback', () => {
            const result = render({
                fileContent: makeTranscriptEntry(EFFORT_HIGH),
                settingsValue: { effortLevel: 'low' }
            });
            expect(result).toBe('Thinking: high');
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

    describe('brackets and level colors', () => {
        const ORANGE = '\x1b[38;5;208m';
        const FG_RESET = '\x1b[39m';
        const xhighStatus = { effort: { level: 'xhigh' } };

        it('wraps the live effort in the chosen brackets', () => {
            expect(render({ rawValue: true, statusData: xhighStatus, item: { metadata: { brackets: '()' } } })).toBe('(xhigh)');
        });

        it('applies brackets to the preview too', () => {
            expect(render({ rawValue: true, isPreview: true, item: { metadata: { brackets: '[]' } } })).toBe('[high]');
        });

        it('colors only the effort by level, leaving the rest to the renderer', () => {
            const result = render({
                statusData: xhighStatus,
                item: { color: 'hex:112233', metadata: { brackets: '()', levelColors: 'true', bracketColor: 'widget' } }
            });

            expect(result).toBe(`(Thinking: ${ORANGE}xhigh${FG_RESET})`);
        });

        // The label editor's override replaces "Thinking: " inside the brackets
        it('draws an edited label, or none, with brackets and level colors', () => {
            expect(render({ isPreview: true, item: { metadata: { brackets: '[]', label: 'T ' } } })).toBe('[T high]');
            expect(render({ isPreview: true, item: { metadata: { label: '' } } })).toBe('high');

            const result = render({
                statusData: xhighStatus,
                item: { color: 'hex:112233', metadata: { levelColors: 'true', label: 'T ' } }
            });
            expect(result).toBe(`T ${ORANGE}xhigh${FG_RESET}`);
        });

        it('leaves unknown levels to the renderer\'s color', () => {
            const result = render({
                rawValue: true,
                statusData: { effort: { level: 'super-max' } },
                item: { color: 'hex:112233', metadata: { levelColors: 'true' } }
            });

            expect(result).toBe('super-max?');
        });

        it('emits plain text when colors are disabled', () => {
            const result = render({
                rawValue: true,
                statusData: xhighStatus,
                item: { metadata: { brackets: '()', levelColors: 'true' } },
                settings: { colorLevel: 0 }
            });

            expect(result).toBe('(xhigh)');
        });

        it('asks the renderer to color around its level runs only while level colors are on', () => {
            const widget = new ThinkingEffortWidget();
            const item: WidgetItem = { id: 'e', type: 'thinking-effort' };

            expect(widget.colorsOnlyItsRuns(item)).toBe(false);
            expect(widget.colorsOnlyItsRuns({ ...item, metadata: { levelColors: 'true' } })).toBe(true);
        });

        it('cycles brackets from the (b) keybind and opens the level color editor from (l)', () => {
            const widget = new ThinkingEffortWidget();
            const item: WidgetItem = { id: 'e', type: 'thinking-effort' };
            const keybinds = widget.getCustomKeybinds();
            const bracketAction = keybinds.find(keybind => keybind.key === 'b')?.action ?? '';
            const colorsAction = keybinds.find(keybind => keybind.key === 'l')?.action ?? '';

            expect(widget.handleEditorAction(bracketAction, item)?.metadata).toEqual({ brackets: '()' });
            // null hands the action to renderEditor
            expect(widget.handleEditorAction(colorsAction, item)).toBeNull();
            expect(widget.renderEditor({ widget: item, onComplete: vi.fn(), onCancel: vi.fn(), action: colorsAction })).not.toBeNull();
        });

        it('lists the active options beside the name in the line editor', () => {
            const widget = new ThinkingEffortWidget();

            expect(widget.getEditorDisplay({ id: 'e', type: 'thinking-effort' }).modifierText).toBeUndefined();
            expect(widget.getEditorDisplay({ id: 'e', type: 'thinking-effort', metadata: { brackets: '<>', levelColors: 'true' } }).modifierText)
                .toBe('(brackets <>, level colors)');
        });
    });

    // The renderer colors everything but the level runs, the way it colors any widget
    describe('level colors on the status line', () => {
        const ORANGE = '\x1b[38;5;208m';
        const FG_RESET = '\x1b[39m';
        const levelColored: WidgetItem = { id: 'e', type: 'thinking-effort', metadata: { levelColors: 'true' } };

        function renderLine(item: WidgetItem, settings: Partial<Settings>): string {
            const fullSettings: Settings = { ...DEFAULT_SETTINGS, defaultPadding: '', ...settings };
            const context: RenderContext = { isPreview: false, terminalWidth: 0, data: { effort: { level: 'xhigh' } } };
            const preRenderedLines = preRenderAllWidgets([[item]], fullSettings, context);
            const maxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, fullSettings);
            return renderStatusLine([item], fullSettings, context, preRenderedLines[0] ?? [], maxWidths);
        }

        it('draws the label in the Powerline theme\'s text color', () => {
            const line = renderLine(levelColored, {
                colorLevel: 2,
                powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true, theme: 'nord' }
            });
            // nord's first segment at 256 colors: text 16 on background 73
            const themeText = '\x1b[38;5;16m';

            expect(line).toBe(`${themeText}\x1b[48;5;73mThinking: ${ORANGE}xhigh${themeText}\x1b[49m${FG_RESET}`);
        });

        it('draws the label and widget-colored brackets in the item color', () => {
            const item = { ...levelColored, color: 'hex:112233', metadata: { levelColors: 'true', brackets: '()' } };
            const BASE = '\x1b[38;2;17;34;51m';

            expect(renderLine(item, { colorLevel: 3 })).toBe(
                `${BASE}${ORANGE}(${BASE}Thinking: ${ORANGE}xhigh${BASE}${ORANGE})${BASE}${FG_RESET}`
            );
        });

        it('leaves the label in the terminal\'s color when the item color is "Default"', () => {
            expect(renderLine({ ...levelColored, color: '' }, { colorLevel: 3 })).toBe(`Thinking: ${ORANGE}xhigh${FG_RESET}`);
        });

        it('sweeps an item gradient across the label and keeps the level color', () => {
            const line = renderLine({ ...levelColored, color: 'gradient:atlas' }, { colorLevel: 3 });

            // atlas runs #feac5e to #4bc0c8 across "Thinking:", the text it colors
            expect(line.startsWith('\x1b[38;2;254;172;94mT')).toBe(true);
            expect(line).toContain(`\x1b[38;2;75;192;200m: ${ORANGE}xhigh${FG_RESET}`);
        });

        it('gives way to a global foreground override', () => {
            expect(renderLine(levelColored, { colorLevel: 3, overrideForegroundColor: 'hex:AABBCC' }))
                .toBe(`\x1b[38;2;170;187;204mThinking: xhigh${FG_RESET}`);
        });

        it('colors nothing at the No Color level', () => {
            expect(renderLine(levelColored, { colorLevel: 0 })).toBe('Thinking: xhigh');
        });
    });
});
