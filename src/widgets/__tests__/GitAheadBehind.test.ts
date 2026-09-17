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
import { GitAheadBehindWidget } from '../GitAheadBehind';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const mockExecFileSync = execFileSync as unknown as {
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

function render(options: {
    metadata?: Record<string, string>;
    rawValue?: boolean;
    isPreview?: boolean;
} = {}) {
    const widget = new GitAheadBehindWidget();
    const context: RenderContext = { isPreview: options.isPreview };
    const item: WidgetItem = {
        id: 'git-ahead-behind',
        type: 'git-ahead-behind',
        rawValue: options.rawValue,
        metadata: options.metadata
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitAheadBehindWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('declares no-git, no-upstream, and a default-enabled zero state', () => {
        const states = new GitAheadBehindWidget().getHideableStates();

        expect(states.map(state => state.key)).toEqual(['no-git', 'no-upstream', 'zero']);
        expect(states.find(state => state.key === 'zero')?.defaultEnabled).toBe(true);
    });

    it('renders preview', () => {
        expect(render({ isPreview: true })).toBe('↑2↓3');
        expect(render({ isPreview: true, rawValue: true })).toBe('2,3');
    });

    it('renders divergence counts', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('2\t3\n');

        expect(render()).toBe('↑2↓3');
    });

    it('renders no git outside a work tree and hides via the unified state', () => {
        mockExecFileSync.mockReturnValue('false\n');
        expect(render()).toBe('(no git)');

        clearGitCache();
        mockExecFileSync.mockReturnValue('false\n');
        expect(render({ metadata: { hide: 'no-git' } })).toBeNull();
    });

    it('renders no upstream and hides via the unified state', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');
        expect(render()).toBe('(no upstream)');

        clearGitCache();
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');
        expect(render({ metadata: { hide: 'no-upstream' } })).toBeNull();
    });

    it('hides when not diverged by default', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('0\t0\n');

        expect(render()).toBeNull();
    });

    it('shows zero divergence when the zero state is opted out', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('0\t0\n');
        expect(render({ metadata: { hide: '' } })).toBe('↑0↓0');

        clearGitCache();
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('0\t0\n');
        expect(render({ metadata: { hide: 'no-git' }, rawValue: true })).toBe('0,0');
    });
});
