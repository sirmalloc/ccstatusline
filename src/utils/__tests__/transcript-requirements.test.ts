import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    TokenMetrics
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { StatusJSON } from '../../types/StatusJSON';
import type { WidgetItem } from '../../types/Widget';
import { calculateContextPercentage } from '../context-percentage';
import { needsTranscriptTokenMetrics } from '../transcript-requirements';
import { WIDGET_MANIFEST } from '../widget-manifest';

const MODEL = { id: 'claude-sonnet-4-5-20250929', display_name: 'Sonnet 4.5' };

const PAYLOADS: Record<string, StatusJSON> = {
    'no context_window': { model: MODEL },
    'full context_window': {
        model: MODEL,
        context_window: {
            context_window_size: 200000,
            total_input_tokens: 1000,
            total_output_tokens: 500,
            current_usage: {
                input_tokens: 10,
                output_tokens: 20,
                cache_creation_input_tokens: 300,
                cache_read_input_tokens: 4000
            },
            used_percentage: 12.5,
            remaining_percentage: 87.5
        }
    },
    'context_window without size': {
        model: MODEL,
        context_window: { current_usage: 42000 }
    },
    'context_window with percentage only': {
        model: MODEL,
        context_window: { used_percentage: 30 }
    },
    'context_window with size and percentage only': {
        model: MODEL,
        context_window: { context_window_size: 200000, used_percentage: 30 }
    }
};

const SENTINEL_METRICS: TokenMetrics = {
    inputTokens: 111111,
    outputTokens: 222222,
    cachedTokens: 333333,
    cacheReadTokens: 300000,
    cacheCreationTokens: 33333,
    totalTokens: 666666,
    contextLength: 77777
};

// Widgets that shell out, read the clock, or read files and usage caches; none
// of them read tokenMetrics, and rendering them here would be slow and flaky.
const EXTERNAL_STATE_PREFIXES = [
    'git-',
    'jj-',
    'worktree-',
    'custom-',
    'claude-',
    'block-',
    'cache-timer',
    'current-working-dir',
    'extra-usage-',
    'weekly-',
    'fable-',
    'reset-timer',
    'session-usage',
    'free-memory',
    'skills',
    'terminal-width'
];

function renderWithMetrics(item: WidgetItem, data: StatusJSON, tokenMetrics: TokenMetrics | null): string | null {
    const widget = WIDGET_MANIFEST.find(entry => entry.type === item.type)?.create();
    const context: RenderContext = { data, tokenMetrics };
    return widget?.render(item, context, DEFAULT_SETTINGS) ?? null;
}

describe('needsTranscriptTokenMetrics', () => {
    const itemVariants = (type: string): WidgetItem[] => [
        { id: '1', type },
        { id: '2', type, metadata: { cacheScopeSession: 'true' } }
    ];
    const renderableTypes = WIDGET_MANIFEST
        .map(entry => entry.type)
        .filter(type => !EXTERNAL_STATE_PREFIXES.some(prefix => type.startsWith(prefix)));

    for (const [payloadName, data] of Object.entries(PAYLOADS)) {
        it(`covers every widget whose output depends on transcript metrics (${payloadName})`, () => {
            for (const type of renderableTypes) {
                for (const item of itemVariants(type)) {
                    if (needsTranscriptTokenMetrics([[item]], DEFAULT_SETTINGS, data)) {
                        continue;
                    }

                    expect(
                        renderWithMetrics(item, data, SENTINEL_METRICS),
                        `${type} ${JSON.stringify(item.metadata ?? {})}`
                    ).toBe(renderWithMetrics(item, data, null));
                }
            }
        }, 30000);

        it(`covers the full-until-compact flex width (${payloadName})`, () => {
            const settings = { ...DEFAULT_SETTINGS, flexMode: 'full-until-compact' as const };
            if (needsTranscriptTokenMetrics([[{ id: '1', type: 'model' }]], settings, data)) {
                return;
            }

            expect(calculateContextPercentage({ data, tokenMetrics: SENTINEL_METRICS }))
                .toBe(calculateContextPercentage({ data, tokenMetrics: null }));
        });
    }

    it('skips the scan when the status JSON supplies the context fields', () => {
        const data = PAYLOADS['full context_window'] ?? {};
        const lines: WidgetItem[][] = [[
            { id: '1', type: 'model' },
            { id: '2', type: 'context-length' },
            { id: '3', type: 'context-percentage' },
            { id: '4', type: 'context-percentage-usable' },
            { id: '5', type: 'context-bar' },
            { id: '6', type: 'cache-hit-rate' }
        ]];

        expect(needsTranscriptTokenMetrics(lines, DEFAULT_SETTINGS, data)).toBe(false);
        expect(needsTranscriptTokenMetrics(lines, { flexMode: 'full-until-compact' }, data)).toBe(false);
    });

    it('scans when a context widget has to fall back to the transcript', () => {
        const data = PAYLOADS['no context_window'] ?? {};

        for (const type of ['context-length', 'context-percentage', 'context-percentage-usable', 'context-bar']) {
            expect(needsTranscriptTokenMetrics([[{ id: '1', type }]], DEFAULT_SETTINGS, data), type).toBe(true);
        }
        expect(needsTranscriptTokenMetrics([[{ id: '1', type: 'model' }]], { flexMode: 'full-until-compact' }, data)).toBe(true);
    });

    it('scans for context-bar when only the window size is missing', () => {
        const data = PAYLOADS['context_window without size'] ?? {};

        expect(needsTranscriptTokenMetrics([[{ id: '1', type: 'context-length' }]], DEFAULT_SETTINGS, data)).toBe(false);
        expect(needsTranscriptTokenMetrics([[{ id: '1', type: 'context-bar' }]], DEFAULT_SETTINGS, data)).toBe(true);
    });

    it('always scans for token widgets and session-scoped cache widgets', () => {
        const data = PAYLOADS['full context_window'] ?? {};

        for (const type of ['tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total']) {
            expect(needsTranscriptTokenMetrics([[{ id: '1', type }]], DEFAULT_SETTINGS, data), type).toBe(true);
        }
        for (const type of ['cache-hit-rate', 'cache-read', 'cache-write']) {
            expect(needsTranscriptTokenMetrics([[{ id: '1', type }]], DEFAULT_SETTINGS, data), type).toBe(false);
            expect(needsTranscriptTokenMetrics(
                [[{ id: '1', type, metadata: { cacheScopeSession: 'true' } }]],
                DEFAULT_SETTINGS,
                data
            ), type).toBe(true);
        }
    });
});
