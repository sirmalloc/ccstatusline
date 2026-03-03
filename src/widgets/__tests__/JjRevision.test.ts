import { execSync } from 'child_process';
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
import { JjRevisionWidget } from '../JjRevision';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

function render(options: {
    cwd?: string;
    hideNoJj?: boolean;
    isPreview?: boolean;
    rawValue?: boolean;
} = {}) {
    const widget = new JjRevisionWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'jj-revision',
        type: 'jj-revision',
        rawValue: options.rawValue,
        metadata: options.hideNoJj ? { hideNoJj: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('JjRevisionWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe(' kkmpptxz');
    });

    it('should render preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('kkmpptxz');
    });

    it('should render change id', () => {
        mockExecSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecSync.mockReturnValueOnce('kkmpptxz');

        expect(render({ cwd: '/tmp/repo' })).toBe(' kkmpptxz');
    });

    it('should render raw change id', () => {
        mockExecSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecSync.mockReturnValueOnce('kkmpptxz');

        expect(render({ rawValue: true })).toBe('kkmpptxz');
    });

    it('should render no jj when not in jj repo', () => {
        mockExecSync.mockImplementation(() => { throw new Error('Not a jj repo'); });

        expect(render()).toBe(' no jj');
    });

    it('should hide no jj when configured', () => {
        mockExecSync.mockImplementation(() => { throw new Error('Not a jj repo'); });

        expect(render({ hideNoJj: true })).toBeNull();
    });

    it('should render no jj when change id lookup is empty', () => {
        mockExecSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecSync.mockReturnValueOnce('');

        expect(render()).toBe(' no jj');
    });
});
