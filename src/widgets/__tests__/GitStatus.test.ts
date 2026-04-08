import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { GitStatusWidget } from '../GitStatus';

describe('GitStatusWidget', () => {
    const widget = new GitStatusWidget();

    it('shows combined status indicators in preview', () => {
        const context: RenderContext = { isPreview: true };
        const item = { id: '1', type: 'git-status' };
        const result = widget.render(item, context, DEFAULT_SETTINGS);

        expect(result).toBe('+*');
    });

    it('has correct metadata', () => {
        expect(widget.getDefaultColor()).toBe('yellow');
        expect(widget.getDisplayName()).toBe('Git Status');
        expect(widget.getCategory()).toBe('Git');
        expect(widget.supportsRawValue()).toBe(false);
    });

    it('shows correct description including conflicts', () => {
        expect(widget.getDescription()).toContain('! conflicts');
    });
});