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
import { JjInsertionsWidget } from '../JjInsertions';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValueOnce: (value: string) => void;
};

function render(options: {
    cwd?: string;
    hideNoJj?: boolean;
    isPreview?: boolean;
} = {}) {
    const widget = new JjInsertionsWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'jj-insertions',
        type: 'jj-insertions',
        metadata: options.hideNoJj ? { hideNoJj: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('JjInsertionsWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('+42');
    });

    it('should render insertions', () => {
        mockExecFileSync.mockReturnValueOnce('/my/project\n');
        mockExecFileSync.mockReturnValueOnce('2 files changed, 7 insertions(+), 3 deletions(-)');

        expect(render({ cwd: '/my/project' })).toBe('+7');
        expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('jj');
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['root']);
        expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/my/project'
        });
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual(['diff', '--stat']);
    });

    it('should render no jj when not in repo', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('No jj'); });

        expect(render()).toBe('(no jj)');
    });

    it('should hide no jj when configured', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('No jj'); });

        expect(render({ hideNoJj: true })).toBeNull();
    });

    it('should render zero insertions when no diff output', () => {
        mockExecFileSync.mockReturnValueOnce('/my/project\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render({ cwd: '/my/project' })).toBe('+0');
    });
});
