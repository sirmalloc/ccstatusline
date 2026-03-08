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
import { GitCleanStatusWidget } from '../GitCleanStatus';

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
    const widget = new GitCleanStatusWidget();
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
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('✓');
    });

    it('should render preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('clean');
    });

    it('should render clean status', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('');

        expect(render({ cwd: '/tmp/worktree' })).toBe('✓');
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

    it('should render dirty status', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce(' M file.ts\n');

        expect(render()).toBe('✗');
    });

    it('should render raw clean status', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('');

        expect(render({ rawValue: true })).toBe('clean');
    });

    it('should render raw dirty status', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce(' M file.ts\n');

        expect(render({ rawValue: true })).toBe('dirty');
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
});