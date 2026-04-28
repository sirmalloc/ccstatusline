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
import { JjWorkspaceWidget } from '../JjWorkspace';

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
    rawValue?: boolean;
} = {}) {
    const widget = new JjWorkspaceWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'jj-workspace',
        type: 'jj-workspace',
        rawValue: options.rawValue,
        metadata: options.hideNoJj ? { hideNoJj: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('JjWorkspaceWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('◆ default');
    });

    it('should render preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('default');
    });

    it('should render default workspace', () => {
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('default\n');

        expect(render({ cwd: '/tmp/repo' })).toBe('◆ default');
        expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('jj');
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['root']);
        expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/repo'
        });
        expect(mockExecFileSync.mock.calls[1]?.[0]).toBe('jj');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual([
            'workspace',
            'list',
            '--template',
            'if(target.current_working_copy(), name ++ "\n")'
        ]);
        expect(mockExecFileSync.mock.calls[1]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/repo'
        });
    });

    it('should render named workspace', () => {
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('feature\n');

        expect(render()).toBe('◆ feature');
    });

    it('should render the active workspace instead of the first listed workspace', () => {
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('\nfeature\n');

        expect(render()).toBe('◆ feature');
    });

    it('should render raw workspace value', () => {
        mockExecFileSync.mockReturnValueOnce('/tmp/repo\n');
        mockExecFileSync.mockReturnValueOnce('default\n');

        expect(render({ rawValue: true })).toBe('default');
    });

    it('should render no jj when not in jj repo', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not a jj repo'); });

        expect(render()).toBe('◆ no jj');
    });

    it('should hide no jj when configured', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not a jj repo'); });

        expect(render({ hideNoJj: true })).toBeNull();
    });
});
