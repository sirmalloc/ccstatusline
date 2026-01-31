import { execSync } from 'child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock
} from 'vitest';

import type { WidgetItem } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { GitIndicatorsWidget } from '../GitIndicators';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as Mock;
const widget = new GitIndicatorsWidget();

function render(options: { preserveColors?: boolean; isPreview?: boolean } = {}) {
    const item: WidgetItem = {
        id: 'test',
        type: 'git-indicators',
        preserveColors: options.preserveColors
    };
    return widget.render(item, { isPreview: options.isPreview ?? false }, DEFAULT_SETTINGS);
}

function mockGitState(inRepo: boolean, staged: boolean, unstaged: boolean) {
    mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'git rev-parse --git-dir') {
            if (!inRepo)
                throw new Error('Not a git repo');
            return '.git';
        }
        if (cmd === 'git diff --staged --quiet' && staged)
            throw new Error('Changes');
        if (cmd === 'git diff --quiet' && unstaged)
            throw new Error('Changes');
        return '';
    });
}

describe('GitIndicatorsWidget', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows + for staged, * for unstaged, +* for both', () => {
        mockGitState(true, true, false);
        expect(render()).toBe('+');

        mockGitState(true, false, true);
        expect(render()).toBe('*');

        mockGitState(true, true, true);
        expect(render()).toBe('+*');

        mockGitState(true, false, false);
        expect(render()).toBe('');
    });

    it('returns empty string when not in git repo', () => {
        mockGitState(false, false, false);
        expect(render()).toBe('');
    });

    it('outputs ANSI colors when preserveColors is true', () => {
        mockGitState(true, true, true);
        expect(render({ preserveColors: true })).toBe('\x1b[32m+\x1b[0m\x1b[31m*\x1b[0m');
    });

    it('shows preview with indicators', () => {
        expect(render({ isPreview: true })).toBe('+*');
        expect(render({ preserveColors: true, isPreview: true })).toBe('\x1b[32m+\x1b[0m\x1b[31m*\x1b[0m');
    });

    it('toggles preserveColors via handleEditorAction', () => {
        const item: WidgetItem = { id: 'test', type: 'git-indicators' };

        const afterToggleOn = widget.handleEditorAction('toggle-preserve-colors', item);
        expect(afterToggleOn?.preserveColors).toBe(true);

        const afterToggleOff = widget.handleEditorAction('toggle-preserve-colors', { ...item, preserveColors: true });
        expect(afterToggleOff?.preserveColors).toBe(false);
    });
});