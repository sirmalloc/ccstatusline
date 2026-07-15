import { execFileSync } from 'child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { AtomicChangeWidget } from '../AtomicChange';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValueOnce: (value: string) => void;
};

const CHANGE_OUTPUT = [
    'change KQNCPFYKX576 (#2)',
    'Author: bradley <bradley.hilton@atomic.dev>',
    'Date:   2026-07-15 16:05:19',
    '',
    '    initial',
    '',
    'Graph: +8 vertices, ~0 edges, 40 bytes'
].join('\n');

function render(options: {
    cwd?: string;
    hideNoAtomic?: boolean;
    isPreview?: boolean;
    rawValue?: boolean;
} = {}) {
    const widget = new AtomicChangeWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'atomic-change',
        type: 'atomic-change',
        rawValue: options.rawValue,
        metadata: options.hideNoAtomic ? { hideNoAtomic: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('AtomicChangeWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe(' KQNCPFYKX576');
    });

    it('should render the current change hash', () => {
        mockExecFileSync.mockReturnValueOnce('');
        mockExecFileSync.mockReturnValueOnce(CHANGE_OUTPUT);

        expect(render({ cwd: '/tmp/repo' })).toBe(' KQNCPFYKX576');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual(['change']);
    });

    it('should render raw value without leading space', () => {
        mockExecFileSync.mockReturnValueOnce('');
        mockExecFileSync.mockReturnValueOnce(CHANGE_OUTPUT);

        expect(render({ rawValue: true })).toBe('KQNCPFYKX576');
    });

    it('should render no atomic when not in atomic repo', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not an atomic repo'); });

        expect(render()).toBe(' no atomic');
    });

    it('should hide no atomic when configured', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not an atomic repo'); });

        expect(render({ hideNoAtomic: true })).toBeNull();
    });
});
