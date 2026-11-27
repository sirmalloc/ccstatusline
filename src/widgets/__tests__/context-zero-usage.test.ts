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
import * as claudeSettings from '../../utils/claude-settings';
import { ContextBarWidget } from '../ContextBar';
import { ContextLengthWidget } from '../ContextLength';
import { ContextPercentageWidget } from '../ContextPercentage';
import { ContextPercentageUsableWidget } from '../ContextPercentageUsable';

// Claude Code sends this for a resumed chat until the chat makes its next
// API call, even when the transcript holds a 200k-token conversation.
const ZERO_CONTEXT_WINDOW: NonNullable<StatusJSON['context_window']> = {
    context_window_size: 1000000,
    total_input_tokens: 0,
    total_output_tokens: 0,
    current_usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
    },
    used_percentage: 0,
    remaining_percentage: 100
};

const TRANSCRIPT_CONTEXT_LENGTH = 206247;

function renderAll(contextWindow: StatusJSON['context_window'], transcriptContextLength: number) {
    const context: RenderContext = {
        data: {
            model: { id: 'claude-opus-4-6[1m]' },
            context_window: contextWindow
        },
        tokenMetrics: {
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            totalTokens: 0,
            contextLength: transcriptContextLength
        }
    };
    const item = (type: string): WidgetItem => ({ id: type, type });

    return {
        'context-percentage': new ContextPercentageWidget().render(item('context-percentage'), context, DEFAULT_SETTINGS),
        'context-percentage-usable': new ContextPercentageUsableWidget().render(item('context-percentage-usable'), context, DEFAULT_SETTINGS),
        'context-length': new ContextLengthWidget().render(item('context-length'), context, DEFAULT_SETTINGS),
        'context-bar': new ContextBarWidget().render(item('context-bar'), context, DEFAULT_SETTINGS)
    };
}

describe('context widgets when Claude Code reports all-zero usage', () => {
    beforeEach(() => {
        vi.spyOn(claudeSettings, 'getAutoCompactConfig').mockReturnValue({});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('show the transcript context instead of 0% for a resumed chat', () => {
        expect(renderAll(ZERO_CONTEXT_WINDOW, TRANSCRIPT_CONTEXT_LENGTH)).toEqual({
            'context-percentage': 'Ctx Used: 20.6%',
            'context-percentage-usable': 'Ctx(u) Used: 25.8%',
            'context-length': 'Ctx: 206.2k',
            'context-bar': 'Context: [███░░░░░░░░░░░░░] 206k/1.0M (21%)'
        });
    });

    it('show 0% for a new chat whose transcript has no usage yet', () => {
        expect(renderAll(ZERO_CONTEXT_WINDOW, 0)).toEqual({
            'context-percentage': 'Ctx Used: 0.0%',
            'context-percentage-usable': 'Ctx(u) Used: 0.0%',
            'context-length': 'Ctx: 0',
            'context-bar': 'Context: [░░░░░░░░░░░░░░░░] 0/1.0M (0%)'
        });
    });
});
