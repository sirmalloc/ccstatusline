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
import { AtomicDescriptionWidget } from '../AtomicDescription';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValueOnce: (value: string) => void;
};

function changeOutput(message: string) {
    return [
        'change KQNCPFYKX576 (#2)',
        'Author: bradley <bradley.hilton@atomic.dev>',
        'Date:   2026-07-15 16:05:19',
        '',
        `    ${message}`,
        '',
        'Graph: +8 vertices'
    ].join('\n');
}

function render(options: {
    cwd?: string;
    hideNoAtomic?: boolean;
    isPreview?: boolean;
} = {}) {
    const widget = new AtomicDescriptionWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'atomic-description',
        type: 'atomic-description',
        metadata: options.hideNoAtomic ? { hideNoAtomic: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('AtomicDescriptionWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('initial');
    });

    it('should render the change message first line', () => {
        mockExecFileSync.mockReturnValueOnce('');
        mockExecFileSync.mockReturnValueOnce(changeOutput('Add atomic widgets'));

        expect(render({ cwd: '/tmp/repo' })).toBe('Add atomic widgets');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual(['change']);
    });

    it('should render no description placeholder when message is empty', () => {
        mockExecFileSync.mockReturnValueOnce('');
        mockExecFileSync.mockReturnValueOnce([
            'change KQNCPFYKX576 (#2)',
            'Author: bradley <bradley.hilton@atomic.dev>',
            'Date:   2026-07-15 16:05:19',
            '',
            'Graph: +8 vertices'
        ].join('\n'));

        expect(render()).toBe('(no description)');
    });

    it('should render no atomic when not in atomic repo', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not an atomic repo'); });

        expect(render()).toBe('no atomic');
    });

    it('should hide no atomic when configured', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not an atomic repo'); });

        expect(render({ hideNoAtomic: true })).toBeNull();
    });
});
