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
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import * as claudeSettings from '../../utils/claude-settings';
import { ContextPercentageUsableWidget } from '../ContextPercentageUsable';

function render(modelId: string | undefined, contextLength: number, rawValue = false, inverse = false) {
    const widget = new ContextPercentageUsableWidget();
    const context: RenderContext = {
        data: modelId ? { model: { id: modelId } } : undefined,
        tokenMetrics: {
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            totalTokens: 0,
            contextLength
        }
    };
    const item: WidgetItem = {
        id: 'context-percentage-usable',
        type: 'context-percentage-usable',
        rawValue,
        metadata: inverse ? { inverse: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('ContextPercentageUsableWidget', () => {
    const envKeys = ['CLAUDE_AUTOCOMPACT_PCT_OVERRIDE', 'CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'DISABLE_AUTO_COMPACT', 'DISABLE_COMPACT'];
    const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

    beforeEach(() => {
        vi.spyOn(claudeSettings, 'getAutoCompactConfig').mockReturnValue({});
        for (const key of envKeys) {
            Reflect.deleteProperty(process.env, key);
        }
    });

    afterEach(() => {
        vi.restoreAllMocks();
        for (const key of envKeys) {
            const value = originalEnv[key];
            if (value === undefined) {
                Reflect.deleteProperty(process.env, key);
            } else {
                process.env[key] = value;
            }
        }
    });

    it('shows 96k of a configured 120k usable budget as 80%, or 20% remaining', () => {
        process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '60';
        expect(render(undefined, 96000)).toBe('Ctx(u) Used: 80.0%');
        expect(render(undefined, 96000, false, true)).toBe('Ctx(u) Left: 20.0%');
    });

    it('uses the project root from the payload for compaction settings', () => {
        const readConfig = vi.spyOn(claudeSettings, 'getAutoCompactConfig').mockReturnValue({ windowSize: 200000 });
        const context: RenderContext = {
            data: {
                cwd: '/project/nested',
                workspace: { project_dir: '/project' },
                context_window: { context_window_size: 1000000, current_usage: 80000 }
            }
        };
        expect(new ContextPercentageUsableWidget().render({ id: 'usable', type: 'context-percentage-usable' }, context, DEFAULT_SETTINGS))
            .toBe('Ctx(u) Used: 50.0%');
        expect(readConfig).toHaveBeenCalledWith('/project');
    });

    it('uses the full window when auto-compaction is disabled', () => {
        process.env.DISABLE_AUTO_COMPACT = '1';
        expect(render(undefined, 100000)).toBe('Ctx(u) Used: 50.0%');
    });

    it('keeps preview samples independent of compaction settings', () => {
        const context: RenderContext = { isPreview: true };
        process.env.DISABLE_AUTO_COMPACT = '1';
        expect(new ContextPercentageUsableWidget().render({ id: 'usable', type: 'context-percentage-usable' }, context, DEFAULT_SETTINGS))
            .toBe('Ctx(u) Used: 90.0%');
        expect(claudeSettings.getAutoCompactConfig).not.toHaveBeenCalled();
    });

    it('toggles inverse metadata and editor modifier', () => {
        const widget = new ContextPercentageUsableWidget();
        const base: WidgetItem = {
            id: 'context-percentage-usable',
            type: 'context-percentage-usable'
        };

        const inverted = widget.handleEditorAction('toggle-inverse', base);
        const cleared = widget.handleEditorAction('toggle-inverse', inverted ?? base);

        expect(inverted?.metadata?.inverse).toBe('true');
        expect(cleared?.metadata?.inverse).toBe('false');
        expect(widget.getEditorDisplay(base).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay({
            ...base,
            metadata: { inverse: 'true' }
        }).modifierText).toBe('(remaining)');
    });

    it('prefers context_window usage over token metrics when both exist', () => {
        const widget = new ContextPercentageUsableWidget();
        const item: WidgetItem = {
            id: 'context-percentage-usable',
            type: 'context-percentage-usable'
        };
        const context: RenderContext = {
            data: {
                model: { id: 'claude-sonnet-4-5-20250929[1m]' },
                context_window: {
                    current_usage: {
                        input_tokens: 40000,
                        output_tokens: 10000,
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: 0
                    }
                }
            },
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 200000
            }
        };

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Ctx(u) Used: 5.0%');
    });

    it('uses context_window_size for usable denominator even without [1m] model suffix', () => {
        const widget = new ContextPercentageUsableWidget();
        const item: WidgetItem = {
            id: 'context-percentage-usable',
            type: 'context-percentage-usable'
        };
        const context: RenderContext = {
            data: {
                model: { id: 'claude-sonnet-4-6' },
                context_window: { context_window_size: 1000000 }
            },
            tokenMetrics: {
                inputTokens: 0,
                outputTokens: 0,
                cachedTokens: 0,
                totalTokens: 0,
                contextLength: 42000
            }
        };

        expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('Ctx(u) Used: 5.3%');
    });

    describe('Sonnet 4.5 with 800k usable tokens', () => {
        it('should calculate percentage using 800k denominator for Sonnet 4.5 with [1m] suffix', () => {
            const result = render('claude-sonnet-4-5-20250929[1m]', 42000);
            expect(result).toBe('Ctx(u) Used: 5.3%');
        });

        it('should calculate percentage using 800k denominator for Sonnet 4.5 (raw value) with [1m] suffix', () => {
            const result = render('claude-sonnet-4-5-20250929[1m]', 42000, true);
            expect(result).toBe('5.3%');
        });

        it('should treat [1M] suffix case-insensitively in fallback mode', () => {
            const result = render('claude-sonnet-4-5-20250929[1M]', 42000);
            expect(result).toBe('Ctx(u) Used: 5.3%');
        });

        it('uses 1M context labels in model id for fallback denominator', () => {
            const result = render('Opus 4.6 (1M context)', 42000);
            expect(result).toBe('Ctx(u) Used: 5.3%');
        });

        it('uses 1M in parentheses in model id for fallback denominator', () => {
            const result = render('Opus 4.6 (1M)', 42000);
            expect(result).toBe('Ctx(u) Used: 5.3%');
        });
    });

    describe('Older models with 160k usable tokens', () => {
        it('should calculate percentage using 160k denominator for older Sonnet 3.5', () => {
            const result = render('claude-3-5-sonnet-20241022', 42000);
            expect(result).toBe('Ctx(u) Used: 26.3%');
        });

        it('should calculate percentage using 160k denominator when model ID is undefined', () => {
            const result = render(undefined, 42000);
            expect(result).toBe('Ctx(u) Used: 26.3%');
        });

        it('should calculate percentage using 160k denominator for unknown model', () => {
            const result = render('claude-unknown-model', 42000);
            expect(result).toBe('Ctx(u) Used: 26.3%');
        });
    });
});
