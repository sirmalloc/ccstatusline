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
import { AtomicDeletionsWidget } from '../AtomicDeletions';
import { AtomicInsertionsWidget } from '../AtomicInsertions';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as {
    mockImplementation: (impl: () => never) => void;
    mockReturnValueOnce: (value: string) => void;
};

const DIFF_STAT = ' a.txt | 5 +++--\n 1 file changed, 3 insertions(+), 2 deletions(-)';

function render(widget: AtomicInsertionsWidget | AtomicDeletionsWidget, options: {
    hideNoAtomic?: boolean;
    isPreview?: boolean;
} = {}) {
    const type = widget instanceof AtomicInsertionsWidget ? 'atomic-insertions' : 'atomic-deletions';
    const context: RenderContext = { isPreview: options.isPreview, data: { cwd: '/tmp/repo' } };
    const item: WidgetItem = {
        id: type,
        type,
        metadata: options.hideNoAtomic ? { hideNoAtomic: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('AtomicInsertionsWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render(new AtomicInsertionsWidget(), { isPreview: true })).toBe('+42');
    });

    it('should render insertions from diff --stat', () => {
        mockExecFileSync.mockReturnValueOnce('M  a.txt\n');
        mockExecFileSync.mockReturnValueOnce(DIFF_STAT);

        expect(render(new AtomicInsertionsWidget())).toBe('+3');
    });

    it('should render no atomic when not in atomic repo', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('nope'); });

        expect(render(new AtomicInsertionsWidget())).toBe('(no atomic)');
    });

    it('should hide no atomic when configured', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('nope'); });

        expect(render(new AtomicInsertionsWidget(), { hideNoAtomic: true })).toBeNull();
    });
});

describe('AtomicDeletionsWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render(new AtomicDeletionsWidget(), { isPreview: true })).toBe('-10');
    });

    it('should render deletions from diff --stat', () => {
        mockExecFileSync.mockReturnValueOnce('M  a.txt\n');
        mockExecFileSync.mockReturnValueOnce(DIFF_STAT);

        expect(render(new AtomicDeletionsWidget())).toBe('-2');
    });

    it('should render no atomic when not in atomic repo', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('nope'); });

        expect(render(new AtomicDeletionsWidget())).toBe('(no atomic)');
    });
});
