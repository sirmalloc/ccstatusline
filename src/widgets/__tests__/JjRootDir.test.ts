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
import { JjRootDirWidget } from '../JjRootDir';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

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
        mockExecFileSync.mockReturnValueOnce('/home/user/my-project\n');
        mockExecFileSync.mockReturnValueOnce('/home/user/my-project\n');

        expect(render({ cwd: '/home/user/my-project' })).toBe('my-project');
        expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('jj');
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['root']);
        expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/home/user/my-project'
        });
        expect(mockExecFileSync.mock.calls[1]?.[0]).toBe('jj');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual(['root']);
        expect(mockExecFileSync.mock.calls[1]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/home/user/my-project'
        });
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
        mockExecFileSync.mockReturnValueOnce('/home/user/my-project/\n');

        expect(render()).toBe('my-project');
    });
});
