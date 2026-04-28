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
import { JjChangesWidget } from '../JjChanges';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

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
} = {}) {
    const widget = new JjChangesWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'jj-changes',
        type: 'jj-changes',
        metadata: options.hideNoJj ? { hideNoJj: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('JjChangesWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('(+42,-10)');
    });

    it('should render changes from jj diff --stat', () => {
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('src/main.ts | 5 +++--\n1 file changed, 3 insertions(+), 2 deletions(-)');

        expect(render({ cwd: '/tmp/repo' })).toBe('(+3,-2)');
        expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('jj');
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['root']);
        expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/repo'
        });
        expect(mockExecFileSync.mock.calls[1]?.[0]).toBe('jj');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual(['diff', '--stat']);
        expect(mockExecFileSync.mock.calls[1]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/repo'
        });
    });

    it('should render zero counts when repo is clean', () => {
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render()).toBe('(+0,-0)');
    });

    it('should render no jj when not in jj repo', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not a jj repo'); });

        expect(render()).toBe('(no jj)');
    });

    it('should hide no jj when configured', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not a jj repo'); });

        expect(render({ hideNoJj: true })).toBeNull();
    });

    it('should handle insertions only', () => {
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('src/main.ts | 5 +++++\n1 file changed, 5 insertions(+)');

        expect(render()).toBe('(+5,-0)');
    });

    it('should handle deletions only', () => {
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('src/main.ts | 3 ---\n1 file changed, 3 deletions(-)');

        expect(render()).toBe('(+0,-3)');
    });
});
