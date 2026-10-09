import { execFileSync } from 'node:child_process';
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
import { JjBookmarksWidget } from '../JjBookmarks';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

function render(options: {
    cwd?: string;
    hideNoJj?: boolean;
    isPreview?: boolean;
    rawValue?: boolean;
} = {}) {
    const widget = new JjBookmarksWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'jj-bookmarks',
        type: 'jj-bookmarks',
        rawValue: options.rawValue,
        metadata: options.hideNoJj ? { hide: 'no-jj' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

mockExecutableResolution();

describe('JjBookmarksWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('🔖 main');
    });

    it('should render preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('main');
    });

    it('should render bookmark name', () => {
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('main');

        expect(render({ cwd: '/tmp/repo' })).toBe('🔖 main');
        expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('jj');
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['root']);
        expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true,
            cwd: '/tmp/repo'
        });
        expect(mockExecFileSync.mock.calls[1]?.[0]).toBe('jj');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual([
            'log',
            '--no-graph',
            '-r',
            'heads(::@ & bookmarks())',
            '--template',
            String.raw`bookmarks ++ "\n"`
        ]);
        expect(mockExecFileSync.mock.calls[1]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true,
            cwd: '/tmp/repo'
        });
    });

    it('should render multiple bookmarks', () => {
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('main feature-branch');

        expect(render()).toBe('🔖 main, feature-branch');
    });

    it('should separate bookmarks on different heads', () => {
        // @ on a merge of two bookmarked heads: jj prints one template output
        // per head, back to back, so each ends with the template's newline
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('feature-a\nfeature-b\n');

        expect(render()).toBe('🔖 feature-a, feature-b');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toContain(String.raw`bookmarks ++ "\n"`);
    });

    it('should render raw bookmark value', () => {
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('main');

        expect(render({ rawValue: true })).toBe('main');
    });

    it('should render no jj when not in jj repo', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not a jj repo'); });

        expect(render()).toBe('🔖 no jj');
    });

    it('should hide no jj when configured', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not a jj repo'); });

        expect(render({ hideNoJj: true })).toBeNull();
    });

    it('should render none when no bookmarks at current change', () => {
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render()).toBe('🔖 (none)');
    });
});
