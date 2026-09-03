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
    hide?: string;
    hideNoGit?: boolean;
    zeroDisplay?: string;
    cleanSymbol?: string;
} = {}) {
    const widget = new GitConflictsWidget();
    const context: RenderContext = { isPreview: options.isPreview };
    const hide = options.hide ?? (options.hideNoGit ? 'no-git' : undefined);
    const metadata: Record<string, string> = {
        ...(hide !== undefined ? { hide } : {}),
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

    it('renders preview content without a space between the glyph and count', () => {
        expect(render({ isPreview: true })).toBe('⚠2');
    });

    it('renders raw preview content as a count', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('2');
    });

    it('renders no git when outside a repository', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render()).toBe('(no git)');
    });

    it('hides no git through the shared hide state', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('declares no-git and zero as hideable states', () => {
        expect(new GitConflictsWidget().getHideableStates().map(state => state.key)).toEqual(['no-git', 'zero']);
    });

    it('renders zero conflicts instead of hiding the widget by default', () => {
        mockConflictCount(0);

        expect(render()).toBe('⚠0');
    });

    it('renders raw zero conflicts as a numeric count', () => {
        mockConflictCount(0);

        expect(render({ rawValue: true })).toBe('0');
    });

    it('hides zero conflicts through the shared hide state', () => {
        mockConflictCount(0);

        expect(render({ hide: 'zero' })).toBeNull();
    });

    it('hides zero conflicts in raw value mode through the shared hide state', () => {
        mockConflictCount(0);

        expect(render({ hide: 'zero', rawValue: true })).toBeNull();
    });

    it('gives the shared hide state precedence over the clean display', () => {
        mockConflictCount(0);

        expect(render({ hide: 'zero', zeroDisplay: 'clean' })).toBeNull();
    });

    it('keeps non-zero conflicts visible with the zero hide state enabled', () => {
        mockConflictCount(1);

        expect(render({ hide: 'zero' })).toBe('⚠1');
    });

    it('renders the conflict count without a space', () => {
        mockConflictCount(2);

        expect(render()).toBe('⚠2');
    });

    it('renders raw conflicts as a numeric count', () => {
        mockConflictCount(1);

        expect(render({ rawValue: true })).toBe('1');
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

    it('renders the conflict glyph and count for non-zero conflicts in clean mode', () => {
        mockConflictCount(2);

        expect(render({ zeroDisplay: 'clean' })).toBe('⚠2');
    });

    it('toggles the visible zero display back to the default', () => {
        const widget = new GitConflictsWidget();
        const item: WidgetItem = { id: 'git-conflicts', type: 'git-conflicts' };

        const clean = widget.handleEditorAction('cycle-zero-display', item);
        const back = widget.handleEditorAction('cycle-zero-display', clean ?? item);

        expect(clean?.metadata?.zeroDisplay).toBe('clean');
        expect(back?.metadata?.zeroDisplay).toBeUndefined();
    });

    it('keeps zero appearance on z and leaves h to the shared hide editor', () => {
        const keys = new GitConflictsWidget().getCustomKeybinds().map(keybind => keybind.key);

        expect(keys).toContain('z');
        expect(keys).not.toContain('h');
    });
});
