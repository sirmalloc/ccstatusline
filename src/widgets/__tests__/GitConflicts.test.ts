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
import { GitConflictsWidget } from '../GitConflicts';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

function render(options: {
    isPreview?: boolean;
    rawValue?: boolean;
    hideNoGit?: boolean;
} = {}) {
    const widget = new GitConflictsWidget();
    const context: RenderContext = { isPreview: options.isPreview };
    const item: WidgetItem = {
        id: 'git-conflicts',
        type: 'git-conflicts',
        rawValue: options.rawValue,
        metadata: options.hideNoGit ? { hideNoGit: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitConflictsWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('renders preview content', () => {
        expect(render({ isPreview: true })).toBe('⚠ 2');
    });

    it('renders raw preview content as a count', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('2');
    });

    it('renders no git when outside a repository', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render()).toBe('(no git)');
    });

    it('hides no git when configured', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('renders zero conflicts instead of hiding the widget', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render()).toBe('⚠ 0');
    });

    it('renders raw zero conflicts as a numeric count', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render({ rawValue: true })).toBe('0');
    });

    it('renders the conflict count', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce([
            '100644 hash 1\tconflict-a',
            '100644 hash 2\tconflict-a',
            '100644 hash 3\tconflict-a',
            '100644 hash 1\tconflict-b',
            '100644 hash 2\tconflict-b',
            '100644 hash 3\tconflict-b'
        ].join('\n'));

        expect(render()).toBe('⚠ 2');
    });

    it('renders raw conflicts as a numeric count', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce([
            '100644 hash 1\tconflict-a',
            '100644 hash 2\tconflict-a',
            '100644 hash 3\tconflict-a'
        ].join('\n'));

        expect(render({ rawValue: true })).toBe('1');
    });
});