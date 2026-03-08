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
import { GitAheadBehindWidget } from '../GitAheadBehind';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

function render(options: {
    cwd?: string;
    hideNoGit?: boolean;
    isPreview?: boolean;
    rawValue?: boolean;
} = {}) {
    const widget = new GitAheadBehindWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'git-ahead-behind',
        type: 'git-ahead-behind',
        rawValue: options.rawValue,
        metadata: options.hideNoGit ? { hideNoGit: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitAheadBehindWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('↑2 ↓1');
    });

    it('should render preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('2 1');
    });

    it('should render ahead/behind counts', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('2\t1');

        expect(render({ cwd: '/tmp/worktree' })).toBe('↑2 ↓1');
        expect(mockExecSync.mock.calls[0]?.[1]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
        expect(mockExecSync.mock.calls[1]?.[1]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
    });

    it('should render raw ahead/behind counts', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('2 1');

        expect(render({ rawValue: true })).toBe('2 1');
    });

    it('should render no upstream when upstream lookup is empty', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('');

        expect(render()).toBe('(no upstream)');
    });

    it('should hide no upstream when configured', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('');

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('should render no upstream when upstream counts are invalid', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('invalid');

        expect(render()).toBe('(no upstream)');
    });

    it('should render no git when probe returns false', () => {
        mockExecSync.mockReturnValue('false\n');

        expect(render()).toBe('(no git)');
    });

    it('should hide no git when configured', () => {
        mockExecSync.mockReturnValue('false\n');

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('should render no git when command fails', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No git'); });

        expect(render()).toBe('(no git)');
    });

    it('should render no upstream when git is available but upstream lookup throws', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockImplementation(() => { throw new Error('fatal: no upstream configured'); });

        expect(render()).toBe('(no upstream)');
    });

    it('should hide no upstream when git is available but upstream lookup throws and hideNoGit configured', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockImplementation(() => { throw new Error('fatal: no upstream configured'); });

        expect(render({ hideNoGit: true })).toBeNull();
    });
});