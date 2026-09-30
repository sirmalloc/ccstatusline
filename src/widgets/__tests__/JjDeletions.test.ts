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
import { useJjTestWorkspace } from '../../utils/__tests__/jj-test-helpers';
import { JjDeletionsWidget } from '../JjDeletions';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

const workspace = useJjTestWorkspace();

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
    const widget = new JjDeletionsWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: { cwd: options.cwd ?? workspace.root }
    };
    const item: WidgetItem = {
        id: 'jj-deletions',
        type: 'jj-deletions',
        metadata: options.hideNoJj ? { hide: 'no-jj' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('JjDeletionsWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('-10');
    });

    it('should render deletions', () => {
        mockExecFileSync.mockReturnValueOnce('/my/project\n');
        mockExecFileSync.mockReturnValueOnce('2 files changed, 5 insertions(+), 8 deletions(-)');

        expect(render()).toBe('-8');
        expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('jj');
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['root']);
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

    it('should render zero deletions when no diff output', () => {
        mockExecFileSync.mockReturnValueOnce('/my/project\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render()).toBe('-0');
    });
});
