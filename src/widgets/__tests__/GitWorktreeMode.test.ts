import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { WidgetItem } from '../../types/Widget';
import { GitWorktreeModeWidget } from '../GitWorktreeMode';

describe('GitWorktreeModeWidget', () => {
    const widget = new GitWorktreeModeWidget();
    const item: WidgetItem = { id: 'wt-mode', type: 'git-worktree-mode' };

    describe('getValueType', () => {
        it('returns boolean', () => {
            expect(widget.getValueType()).toBe('boolean');
        });
    });

    describe('getValue', () => {
        it('returns true when in worktree mode', () => {
            const context: RenderContext = {
                data: { worktree: { name: 'feature', original_branch: 'main', branch: 'feature-branch' } }
            };

            expect(widget.getValue(context, item)).toBe(true);
        });

        it('returns false when not in worktree mode', () => {
            const context: RenderContext = { data: {} };

            expect(widget.getValue(context, item)).toBe(false);
        });

        it('returns false when data is undefined', () => {
            const context: RenderContext = {};

            expect(widget.getValue(context, item)).toBe(false);
        });

        it('returns true in preview mode', () => {
            const context: RenderContext = { isPreview: true };

            expect(widget.getValue(context, item)).toBe(true);
        });
    });
});
