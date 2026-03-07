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
import { JjChangesWidget } from '../JjChanges';

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

    it('should render changes', () => {
        mockExecSync.mockReturnValueOnce('/my/project\n');
        mockExecSync.mockReturnValueOnce('2 files changed, 5 insertions(+), 3 deletions(-)');

        expect(render({ cwd: '/my/project' })).toBe('(+5,-3)');
    });

    it('should render no jj when not in workspace', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No jj'); });

        expect(render()).toBe('(no jj)');
    });

    it('should hide no jj when configured', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No jj'); });

        expect(render({ hideNoJj: true })).toBeNull();
    });

    it('should render zero changes when no diff output', () => {
        mockExecSync.mockReturnValueOnce('/my/project\n');
        mockExecSync.mockReturnValueOnce('');

        expect(render({ cwd: '/my/project' })).toBe('(+0,-0)');
    });
});