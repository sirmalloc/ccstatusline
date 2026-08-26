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
    zeroDisplay?: string;
    cleanSymbol?: string;
} = {}) {
    const widget = new GitConflictsWidget();
    const context: RenderContext = { isPreview: options.isPreview };
    const metadata: Record<string, string> = {
        ...(options.hideNoGit ? { hideNoGit: 'true' } : {}),
        ...(options.zeroDisplay ? { zeroDisplay: options.zeroDisplay } : {}),
        ...(options.cleanSymbol ? { symbolClean: options.cleanSymbol } : {})
    };
    const item: WidgetItem = {
        id: 'git-conflicts',
        type: 'git-conflicts',
        rawValue: options.rawValue,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

function mockConflictCount(count: number) {
    mockExecFileSync.mockReturnValueOnce('true\n');
    mockExecFileSync.mockReturnValueOnce(
        Array.from({ length: count }, (_, index) => [
            `100644 hash 1\tconflict-${index}`,
            `100644 hash 2\tconflict-${index}`,
            `100644 hash 3\tconflict-${index}`
        ].join('\n')).join('\n')
    );
}

describe('GitConflictsWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('renders preview content', () => {
        expect(render({ isPreview: true })).toBe('⚠2');
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

        expect(render()).toBe('⚠0');
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

        expect(render()).toBe('⚠2');
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

    it('hides the widget when zero conflicts are configured as hidden', () => {
        mockConflictCount(0);

        expect(render({ zeroDisplay: 'hidden' })).toBeNull();
    });

    it('hides the widget when zero conflicts are hidden in raw value mode', () => {
        mockConflictCount(0);

        expect(render({ zeroDisplay: 'hidden', rawValue: true })).toBeNull();
    });

    it('renders the clean glyph when zero conflicts are configured as clean', () => {
        mockConflictCount(0);

        expect(render({ zeroDisplay: 'clean' })).toBe('✓');
    });

    it('renders a custom clean glyph', () => {
        mockConflictCount(0);

        expect(render({ zeroDisplay: 'clean', cleanSymbol: '★' })).toBe('★');
    });

    it('keeps raw value numeric in clean mode', () => {
        mockConflictCount(0);

        expect(render({ zeroDisplay: 'clean', rawValue: true })).toBe('0');
    });

    it('renders the conflict count regardless of the zero display mode', () => {
        mockConflictCount(2);

        expect(render({ zeroDisplay: 'hidden' })).toBe('⚠2');
    });

    it('cycles the zero display mode back to the default', () => {
        const widget = new GitConflictsWidget();
        const item: WidgetItem = { id: 'git-conflicts', type: 'git-conflicts' };

        const clean = widget.handleEditorAction('cycle-zero-display', item);
        const hidden = widget.handleEditorAction('cycle-zero-display', clean ?? item);
        const back = widget.handleEditorAction('cycle-zero-display', hidden ?? item);

        expect(clean?.metadata?.zeroDisplay).toBe('clean');
        expect(hidden?.metadata?.zeroDisplay).toBe('hidden');
        expect(back?.metadata?.zeroDisplay).toBeUndefined();
    });

    it('exposes the zero display keybind', () => {
        const keys = new GitConflictsWidget().getCustomKeybinds().map(keybind => keybind.key);

        expect(keys).toContain('z');
    });
});
