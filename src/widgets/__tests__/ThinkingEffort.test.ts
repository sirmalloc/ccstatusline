import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { ThinkingEffortWidget } from '../ThinkingEffort';

// Mock claude-settings to avoid filesystem reads in tests
vi.mock('../../utils/claude-settings', () => ({
    loadClaudeSettings: vi.fn()
}));

import { loadClaudeSettings } from '../../utils/claude-settings';

const mockedLoadSettings = vi.mocked(loadClaudeSettings);

function makeContext(thinkingData?: { enabled?: boolean; effort?: 'low' | 'medium' | 'high' } | null): object {
    return {
        data: thinkingData !== undefined ? { thinking: thinkingData } : undefined,
        isPreview: false
    };
}

describe('ThinkingEffortWidget', () => {
    let widget: ThinkingEffortWidget;

    beforeEach(() => {
        widget = new ThinkingEffortWidget();
        vi.clearAllMocks();
        mockedLoadSettings.mockResolvedValue({} as never);
    });

    describe('metadata', () => {
        it('has correct display name', () => {
            expect(widget.getDisplayName()).toBe('Thinking Effort');
        });

        it('has correct category', () => {
            expect(widget.getCategory()).toBe('Core');
        });

        it('supports raw value', () => {
            expect(widget.supportsRawValue()).toBe(true);
        });

        it('supports colors', () => {
            expect(widget.supportsColors({ type: 'thinking-effort' } as never)).toBe(true);
        });
    });

    describe('preview mode', () => {
        it('returns labelled preview', async () => {
            const result = await widget.render({ type: 'thinking-effort', rawValue: false } as never, { isPreview: true } as never, {} as never);
            expect(result).toBe('Thinking: high');
        });

        it('returns raw preview', async () => {
            const result = await widget.render({ type: 'thinking-effort', rawValue: true } as never, { isPreview: true } as never, {} as never);
            expect(result).toBe('high');
        });
    });

    describe('StatusJSON data', () => {
        it('returns effort from StatusJSON', async () => {
            const ctx = makeContext({ effort: 'medium' });
            const result = await widget.render({ type: 'thinking-effort', rawValue: false } as never, ctx as never, {} as never);
            expect(result).toBe('Thinking: medium');
        });

        it('returns raw effort from StatusJSON', async () => {
            const ctx = makeContext({ effort: 'low' });
            const result = await widget.render({ type: 'thinking-effort', rawValue: true } as never, ctx as never, {} as never);
            expect(result).toBe('low');
        });

        it('returns null when thinking data is null', async () => {
            const ctx = makeContext(null);
            const result = await widget.render({ type: 'thinking-effort', rawValue: false } as never, ctx as never, {} as never);
            expect(result).toBeNull();
        });
    });

    describe('Claude settings fallback', () => {
        it('reads thinkingMode from settings when no StatusJSON', async () => {
            mockedLoadSettings.mockResolvedValue({ thinkingMode: 'high' } as never);
            const ctx = makeContext(undefined);
            const result = await widget.render({ type: 'thinking-effort', rawValue: false } as never, ctx as never, {} as never);
            expect(result).toBe('Thinking: high');
        });

        it('handles case-insensitive thinkingMode', async () => {
            mockedLoadSettings.mockResolvedValue({ thinkingMode: 'HIGH' } as never);
            const ctx = makeContext(undefined);
            const result = await widget.render({ type: 'thinking-effort', rawValue: false } as never, ctx as never, {} as never);
            expect(result).toBe('Thinking: high');
        });

        it('returns null when thinkingMode not set', async () => {
            mockedLoadSettings.mockResolvedValue({} as never);
            const ctx = makeContext(undefined);
            const result = await widget.render({ type: 'thinking-effort', rawValue: false } as never, ctx as never, {} as never);
            expect(result).toBeNull();
        });

        it('returns null when settings read fails', async () => {
            mockedLoadSettings.mockRejectedValue(new Error('settings unavailable'));
            const ctx = makeContext(undefined);
            const result = await widget.render({ type: 'thinking-effort', rawValue: false } as never, ctx as never, {} as never);
            expect(result).toBeNull();
        });
    });
});
