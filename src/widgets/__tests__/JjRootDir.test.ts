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
import { JjRootDirWidget } from '../JjRootDir';

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
} = {}) {
    const widget = new JjRootDirWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'jj-root-dir',
        type: 'jj-root-dir',
        metadata: options.hideNoJj ? { hideNoJj: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('JjRootDirWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('my-repo');
    });

    it('should render root directory name', () => {
        mockExecSync.mockReturnValueOnce('/home/user/my-project\n');
        mockExecSync.mockReturnValueOnce('/home/user/my-project\n');

        expect(render({ cwd: '/home/user/my-project' })).toBe('my-project');
    });

    it('should render no jj when not in jj repo', () => {
        mockExecSync.mockImplementation(() => { throw new Error('Not a jj repo'); });

        expect(render()).toBe('no jj');
    });

    it('should hide no jj when configured', () => {
        mockExecSync.mockImplementation(() => { throw new Error('Not a jj repo'); });

        expect(render({ hideNoJj: true })).toBeNull();
    });

    it('should handle trailing slashes', () => {
        mockExecSync.mockReturnValueOnce('/home/user/my-project/\n');
        mockExecSync.mockReturnValueOnce('/home/user/my-project/\n');

        expect(render()).toBe('my-project');
    });
});
