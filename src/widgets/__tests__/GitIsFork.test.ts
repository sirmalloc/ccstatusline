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
import { mockExecutableResolution } from '../../utils/__tests__/executable-path-test-helpers';
import { clearGitCache } from '../../utils/git';
import { GitIsForkWidget } from '../GitIsFork';

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
    character?: string;
    rawValue?: boolean;
    isPreview?: boolean;
    hide?: string;
} = {}) {
    const widget = new GitIsForkWidget();
    const context: RenderContext = { isPreview: options.isPreview };
    const item: WidgetItem = {
        id: 'git-is-fork',
        type: 'git-is-fork',
        character: options.character,
        rawValue: options.rawValue,
        metadata: options.hide === undefined ? undefined : { hide: options.hide }
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

mockExecutableResolution();

describe('GitIsForkWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('renders the default glyph in preview and raw true', () => {
        expect(render({ isPreview: true })).toBe('⑂');
        expect(render({ isPreview: true, rawValue: true })).toBe('true');
    });

    it('renders the glyph when origin and upstream diverge', () => {
        mockExecFileSync.mockReturnValueOnce('git@github.com:axisrow/ccstatusline.git\n');
        mockExecFileSync.mockReturnValueOnce('git@github.com:sirmalloc/ccstatusline.git\n');

        expect(render()).toBe('⑂');

        clearGitCache();
        mockExecFileSync.mockReturnValueOnce('git@github.com:axisrow/ccstatusline.git\n');
        mockExecFileSync.mockReturnValueOnce('git@github.com:sirmalloc/ccstatusline.git\n');
        expect(render({ rawValue: true })).toBe('true');
    });

    it('renders isFork: false outside a fork and hides via the unified state', () => {
        mockExecFileSync.mockReturnValue('git@github.com:axisrow/ccstatusline.git\n');

        expect(render()).toBe('isFork: false');

        clearGitCache();
        mockExecFileSync.mockReturnValue('git@github.com:axisrow/ccstatusline.git\n');
        expect(render({ hide: 'not-fork' })).toBeNull();
    });

    it('honors a glyph override', () => {
        mockExecFileSync.mockReturnValueOnce('git@github.com:axisrow/ccstatusline.git\n');
        mockExecFileSync.mockReturnValueOnce('git@github.com:sirmalloc/ccstatusline.git\n');

        expect(render({ character: 'Ψ' })).toBe('Ψ');
    });
});
