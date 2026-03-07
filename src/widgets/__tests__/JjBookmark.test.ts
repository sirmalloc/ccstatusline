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
import { JjBookmarkWidget } from '../JjBookmark';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
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
    const widget = new JjBookmarkWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'jj-bookmark',
        type: 'jj-bookmark',
        rawValue: options.rawValue,
        metadata: options.hideNoJj ? { hideNoJj: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('JjBookmarkWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('@ main');
    });

    it('should render preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('main');
    });

    it('should render bookmark name', () => {
        mockExecSync.mockReturnValueOnce('/tmp/workspace\n');
        mockExecSync.mockReturnValueOnce('main');

        expect(render({ cwd: '/tmp/workspace' })).toBe('@ main');
        expect(mockExecSync.mock.calls[0]?.[1]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/workspace'
        });
        expect(mockExecSync.mock.calls[1]?.[1]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/workspace'
        });
    });

    it('should render raw bookmark value', () => {
        mockExecSync.mockReturnValueOnce('/tmp/workspace\n');
        mockExecSync.mockReturnValueOnce('main');

        expect(render({ rawValue: true })).toBe('main');
    });

    it('should render no jj when not in workspace', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No jj'); });

        expect(render()).toBe('@ no jj');
    });

    it('should hide no jj when configured', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No jj'); });

        expect(render({ hideNoJj: true })).toBeNull();
    });

    it('should render (none) when bookmarks is empty', () => {
        mockExecSync.mockReturnValueOnce('/tmp/workspace\n');
        mockExecSync.mockReturnValueOnce('');

        expect(render()).toBe('@ (none)');
    });

    it('should render raw (none) when bookmarks is empty', () => {
        mockExecSync.mockReturnValueOnce('/tmp/workspace\n');
        mockExecSync.mockReturnValueOnce('');

        expect(render({ rawValue: true })).toBe('(none)');
    });

    it('should render no jj when command fails', () => {
        mockExecSync.mockReturnValueOnce('/tmp/workspace\n');
        mockExecSync.mockImplementation(() => { throw new Error('Command failed'); });

        expect(render()).toBe('@ no jj');
    });
});