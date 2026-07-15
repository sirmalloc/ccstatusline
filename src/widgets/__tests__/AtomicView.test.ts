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
import { AtomicViewWidget } from '../AtomicView';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValueOnce: (value: string) => void;
};

function render(options: {
    cwd?: string;
    hideNoAtomic?: boolean;
    isPreview?: boolean;
    rawValue?: boolean;
} = {}) {
    const widget = new AtomicViewWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'atomic-view',
        type: 'atomic-view',
        rawValue: options.rawValue,
        metadata: options.hideNoAtomic ? { hideNoAtomic: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('AtomicViewWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('⎇ dev');
    });

    it('should render the current view marked with an asterisk', () => {
        mockExecFileSync.mockReturnValueOnce('M  a.txt\n');
        mockExecFileSync.mockReturnValueOnce('* dev\n  feature-x\n');

        expect(render({ cwd: '/tmp/repo' })).toBe('⎇ dev');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual(['view', 'list']);
    });

    it('should render raw value without symbol', () => {
        mockExecFileSync.mockReturnValueOnce('');
        mockExecFileSync.mockReturnValueOnce('  dev\n* feature-x\n');

        expect(render({ rawValue: true })).toBe('feature-x');
    });

    it('should render no atomic when not in atomic repo', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not an atomic repo'); });

        expect(render()).toBe('⎇ no atomic');
    });

    it('should hide no atomic when configured', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('Not an atomic repo'); });

        expect(render({ hideNoAtomic: true })).toBeNull();
    });
});
