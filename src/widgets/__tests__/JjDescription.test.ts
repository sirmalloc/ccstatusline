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
import { JjDescriptionWidget } from '../JjDescription';

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
        mockExecSync.mockReturnValueOnce('/my/project\n');
        mockExecSync.mockReturnValueOnce('fix: update readme');

        expect(render({ cwd: '/my/project' })).toBe('fix: update readme');
    });

    it('should render no jj when not in workspace', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No jj'); });

        expect(render()).toBe('no jj');
    });

    it('should hide no jj when configured', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No jj'); });

        expect(render({ hideNoJj: true })).toBeNull();
    });

    it('should render no description when description is empty', () => {
        mockExecSync.mockReturnValueOnce('/my/project\n');
        mockExecSync.mockReturnValueOnce('');

        expect(render({ cwd: '/my/project' })).toBe('(no description)');
    });

    it('should render no description when command fails', () => {
        mockExecSync.mockReturnValueOnce('/my/project\n');
        mockExecSync.mockImplementation(() => { throw new Error('Failed'); });

        expect(render({ cwd: '/my/project' })).toBe('no jj');
    });

    it('should hide when command fails and hideNoJj enabled', () => {
        mockExecSync.mockReturnValueOnce('/my/project\n');
        mockExecSync.mockImplementation(() => { throw new Error('Failed'); });

        expect(render({ cwd: '/my/project', hideNoJj: true })).toBeNull();
    });
});