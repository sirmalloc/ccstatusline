import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { ContextPercentageUsableWidget } from '../ContextPercentageUsable';

// `ContextPercentageUsableWidget` resolves compaction overrides by reading
// env vars and walking the Claude Code settings.json layers under the user's
// real `~/.claude` and the process's real cwd. To keep this suite hermetic,
// redirect both to empty tmpdirs for the entire file's lifetime.
const ORIGINAL_ENV = {
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW,
    CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE,
    DISABLE_AUTO_COMPACT: process.env.DISABLE_AUTO_COMPACT,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR
};

let isolatedConfigDir = '';
let isolatedCwd = '';
let originalCwd = '';

function clearCompactionEnv(): void {
    delete process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    delete process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
    delete process.env.DISABLE_AUTO_COMPACT;
    delete process.env.CLAUDE_CONFIG_DIR;
}

function applyIsolatedEnv(): void {
    clearCompactionEnv();
    process.env.CLAUDE_CONFIG_DIR = isolatedConfigDir;
    process.chdir(isolatedCwd);
}

function restoreCompactionEnv(): void {
    if (ORIGINAL_ENV.CLAUDE_CODE_AUTO_COMPACT_WINDOW === undefined) {
        delete process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    } else {
        process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = ORIGINAL_ENV.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    }
    if (ORIGINAL_ENV.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE === undefined) {
        delete process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
    } else {
        process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = ORIGINAL_ENV.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
    }
    if (ORIGINAL_ENV.DISABLE_AUTO_COMPACT === undefined) {
        delete process.env.DISABLE_AUTO_COMPACT;
    } else {
        process.env.DISABLE_AUTO_COMPACT = ORIGINAL_ENV.DISABLE_AUTO_COMPACT;
    }
    if (ORIGINAL_ENV.CLAUDE_CONFIG_DIR === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
    } else {
        process.env.CLAUDE_CONFIG_DIR = ORIGINAL_ENV.CLAUDE_CONFIG_DIR;
    }
}

beforeAll(() => {
    isolatedConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-widget-config-'));
    isolatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-widget-cwd-'));
    originalCwd = process.cwd();
});

afterAll(() => {
    if (originalCwd) {
        try { process.chdir(originalCwd); } catch { /* ignore */ }
    }
    if (isolatedConfigDir) {
        fs.rmSync(isolatedConfigDir, { recursive: true, force: true });
    }
    if (isolatedCwd) {
        fs.rmSync(isolatedCwd, { recursive: true, force: true });
    }
    restoreCompactionEnv();
});

beforeEach(() => {
    applyIsolatedEnv();
});

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

    describe('Claude Code compaction overrides', () => {
        // The top-level `beforeEach` already isolates env + cwd. Each individual
        // test below only needs to set the override(s) it cares about.
        it('respects CLAUDE_CODE_AUTO_COMPACT_WINDOW env to shrink the effective window', () => {
            // Opus 1M → autoCompactWindow=200k → usable = 160k → 70k / 160k = 43.75%.
            process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '200000';
            const result = render('claude-opus-4-6[1m]', 70000);
            expect(result).toBe('Ctx(u) Used: 43.8%');
        });

        it('respects CLAUDE_AUTOCOMPACT_PCT_OVERRIDE env to change the usable ratio', () => {
            // Sonnet 200k, ratio=0.6 → usable = 120k → 96k / 120k = 80%.
            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '60';
            const result = render('claude-sonnet-4-5-20250929', 96000);
            expect(result).toBe('Ctx(u) Used: 80.0%');
        });

        it('respects DISABLE_AUTO_COMPACT=1 env to treat the entire window as usable', () => {
            // Sonnet 200k, ratio=1.0 → usable = 200k → 100k / 200k = 50%.
            process.env.DISABLE_AUTO_COMPACT = '1';
            const result = render('claude-sonnet-4-5-20250929', 100000);
            expect(result).toBe('Ctx(u) Used: 50.0%');
        });

        it('combines window + ratio overrides', () => {
            // Opus 1M → effective 200k, ratio 0.6 → usable = 120k → 60k / 120k = 50%.
            process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '200000';
            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '60';
            const result = render('claude-opus-4-6[1m]', 60000);
            expect(result).toBe('Ctx(u) Used: 50.0%');
        });
    });
});
