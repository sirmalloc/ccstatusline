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
import { GitRootDirWidget } from '../GitRootDir';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mockReturnValue: (value: string) => void;
    mockImplementation: (impl: () => never) => void;
};

function render(options: { isPreview?: boolean; hideNoGit?: boolean } = {}) {
    const widget = new GitRootDirWidget();
    const context: RenderContext = { isPreview: options.isPreview };
    const item: WidgetItem = {
        id: 'git-root-dir',
        type: 'git-root-dir',
        metadata: options.hideNoGit ? { hideNoGit: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitRootDirWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('my-repo');
    });

    it('should render root directory name', () => {
        mockExecSync.mockReturnValue('/some/path/my-repo');

        expect(render()).toBe('my-repo');
    });

    it('should handle trailing separators', () => {
        mockExecSync.mockReturnValue('/some/path/my-repo/');

        expect(render()).toBe('my-repo');
    });

    it('should render unix root path without returning empty output', () => {
        mockExecSync.mockReturnValue('/');

        expect(render()).toBe('/');
    });

    it('should render windows drive root without returning empty output', () => {
        mockExecSync.mockReturnValue('C:/');

        expect(render()).toBe('C:');
    });

    it('should render no git when command fails', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No git'); });

        expect(render()).toBe('no git');
    });

    it('should hide no git when configured', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No git'); });

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('should disable raw value support', () => {
        const widget = new GitRootDirWidget();

        expect(widget.supportsRawValue()).toBe(false);
    });
});