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
import { clearGitCache } from '../../utils/git';
import { GitCleanStatusWidget } from '../GitCleanStatus';

vi.mock('child_process', () => ({
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

const widget = new GitCleanStatusWidget();

function render(options: {
    cwd?: string;
    hideNoGit?: boolean;
    isPreview?: boolean;
    rawValue?: boolean;
} = {}) {
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'git-clean-status',
        type: 'git-clean-status',
        rawValue: options.rawValue,
        metadata: options.hideNoGit ? { hideNoGit: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitCleanStatusWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('renders preview', () => {
        expect(render({ isPreview: true })).toBe('✓');
    });

    it('renders preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('clean');
    });

    it('renders clean status', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render({ cwd: '/tmp/worktree' })).toBe('✓');
        expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual(['--no-optional-locks', 'status', '--porcelain', '-z']);
    });

    it('renders dirty status', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce(' M file.ts\n');

        expect(render()).toBe('✗');
    });

    it('renders raw clean status', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render({ rawValue: true })).toBe('clean');
    });

    it('renders raw dirty status', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce(' M file.ts\n');

        expect(render({ rawValue: true })).toBe('dirty');
    });

    it('renders no git when probe returns false', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render()).toBe('(no git)');
    });

    it('hides no git when configured', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('renders no git when command fails', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('No git'); });

        expect(render()).toBe('(no git)');
    });
});
