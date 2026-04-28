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
import { JjDescriptionWidget } from '../JjDescription';

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
    const widget = new JjDescriptionWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'jj-description',
        type: 'jj-description',
        metadata: options.hideNoJj ? { hideNoJj: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('JjDescriptionWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('(no description)');
    });

    it('should render description', () => {
        mockExecFileSync.mockReturnValueOnce('/my/project\n');
        mockExecFileSync.mockReturnValueOnce('fix: update readme');

        expect(render({ cwd: '/my/project' })).toBe('fix: update readme');
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['root']);
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual([
            'log',
            '--no-graph',
            '-r',
            '@',
            '-T',
            'description.first_line()'
        ]);
    });

    it('should render no jj when not in repo', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('No jj'); });

        expect(render()).toBe('no jj');
    });

    it('should hide no jj when configured', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('No jj'); });

        expect(render({ hideNoJj: true })).toBeNull();
    });

    it('should render no description when description is empty', () => {
        mockExecFileSync.mockReturnValueOnce('/my/project\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render({ cwd: '/my/project' })).toBe('(no description)');
    });

    it('should render no jj when command fails', () => {
        mockExecFileSync.mockReturnValueOnce('/my/project\n');
        mockExecFileSync.mockImplementation(() => { throw new Error('Failed'); });

        expect(render({ cwd: '/my/project' })).toBe('no jj');
    });

    it('should hide when command fails and hideNoJj enabled', () => {
        mockExecFileSync.mockReturnValueOnce('/my/project\n');
        mockExecFileSync.mockImplementation(() => { throw new Error('Failed'); });

        expect(render({ cwd: '/my/project', hideNoJj: true })).toBeNull();
    });
});
