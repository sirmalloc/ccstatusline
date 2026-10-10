import { execFileSync } from 'node:child_process';
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
import { mockExecutableResolution } from '../../utils/__tests__/executable-path-test-helpers';
import { useJjTestWorkspace } from '../../utils/__tests__/jj-test-helpers';
import { JjRootDirWidget } from '../JjRootDir';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const workspace = useJjTestWorkspace();

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

function render(options: {
    cwd?: string;
    hideNoJj?: boolean;
    isPreview?: boolean;
} = {}) {
    const widget = new JjRootDirWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: { cwd: options.cwd ?? workspace.root }
    };
    const item: WidgetItem = {
        id: 'jj-root-dir',
        type: 'jj-root-dir',
        metadata: options.hideNoJj ? { hide: 'no-jj' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

mockExecutableResolution();

describe('JjRootDirWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('my-repo');
    });

    it('should render root directory name', () => {
        mockExecFileSync.mockReturnValueOnce('/home/user/my-project\n');

        expect(render()).toBe('my-project');
        expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('jj');
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['root']);
        expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: 5_000,
            windowsHide: true,
            cwd: workspace.root
        });
        // The repo check and the widget share one cached `jj root` call.
        expect(mockExecFileSync.mock.calls).toHaveLength(1);
    });

    it('should render no jj when not in jj repo', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not a jj repo'); });

        expect(render()).toBe('no jj');
    });

    it('should hide no jj when configured', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not a jj repo'); });

        expect(render({ hideNoJj: true })).toBeNull();
    });

    it('should handle trailing slashes', () => {
        mockExecFileSync.mockReturnValueOnce('/home/user/my-project/\n');

        expect(render()).toBe('my-project');
    });
});
