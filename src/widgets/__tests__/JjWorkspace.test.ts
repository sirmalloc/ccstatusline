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
import { JjWorkspaceWidget } from '../JjWorkspace';

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
        expect(render({ isPreview: true })).toBe('W: default');
    });

    it('should render preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('default');
    });

    it('should render workspace name', () => {
        mockExecSync.mockReturnValueOnce('/tmp/workspace\n');
        mockExecSync.mockReturnValueOnce('default: kpqxywon 2f73e05c (no description set)\n');

        expect(render({ cwd: '/tmp/workspace' })).toBe('W: default');
    });

    it('should render raw workspace name', () => {
        mockExecSync.mockReturnValueOnce('/tmp/workspace\n');
        mockExecSync.mockReturnValueOnce('feature-work: spzqtmlo abc12345 (no description set)\n');

        expect(render({ rawValue: true })).toBe('feature-work');
    });

    it('should render non-default workspace name', () => {
        mockExecSync.mockReturnValueOnce('/tmp/workspace\n');
        mockExecSync.mockReturnValueOnce('feature-work: spzqtmlo abc12345 (no description set)\ndefault: kpqxywon 2f73e05c (no description set)\n');

        expect(render()).toBe('W: feature-work');
    });

    it('should render no jj when not in workspace', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No jj'); });

        expect(render()).toBe('W: no jj');
    });

    it('should hide no jj when configured', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No jj'); });

        expect(render({ hideNoJj: true })).toBeNull();
    });

    it('should render no jj when workspace list is empty', () => {
        mockExecSync.mockReturnValueOnce('/tmp/workspace\n');
        mockExecSync.mockReturnValueOnce('');

        expect(render()).toBe('W: no jj');
    });

    it('should render no jj when command fails', () => {
        mockExecSync.mockReturnValueOnce('/tmp/workspace\n');
        mockExecSync.mockImplementation(() => { throw new Error('Command failed'); });

        expect(render()).toBe('W: no jj');
    });
});