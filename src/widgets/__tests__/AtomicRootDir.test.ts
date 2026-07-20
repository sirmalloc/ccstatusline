import {
    existsSync,
    statSync
} from 'fs';
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
import { AtomicRootDirWidget } from '../AtomicRootDir';

vi.mock('fs', () => ({
    existsSync: vi.fn(),
    statSync: vi.fn()
}));

const mockExistsSync = existsSync as unknown as { mockImplementation: (impl: (p: string) => boolean) => void };
const mockStatSync = statSync as unknown as { mockReturnValue: (value: unknown) => void };

function render(options: {
    cwd?: string;
    hideNoAtomic?: boolean;
    isPreview?: boolean;
} = {}) {
    const widget = new AtomicRootDirWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'atomic-root-dir',
        type: 'atomic-root-dir',
        metadata: options.hideNoAtomic ? { hideNoAtomic: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('AtomicRootDirWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStatSync.mockReturnValue({ isDirectory: () => true });
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('my-repo');
    });

    it('should render root directory name when .atomic is found', () => {
        mockExistsSync.mockImplementation((p: string) => p === '/home/user/my-project/.atomic');

        expect(render({ cwd: '/home/user/my-project/src' })).toBe('my-project');
    });

    it('should render no atomic when no .atomic directory exists', () => {
        mockExistsSync.mockImplementation(() => false);

        expect(render({ cwd: '/home/user/my-project' })).toBe('no atomic');
    });

    it('should hide no atomic when configured', () => {
        mockExistsSync.mockImplementation(() => false);

        expect(render({ cwd: '/home/user/my-project', hideNoAtomic: true })).toBeNull();
    });
});
