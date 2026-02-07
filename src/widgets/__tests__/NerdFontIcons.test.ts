import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import type { Settings } from '../../types/Settings';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { NERD_FONT_ICONS } from '../../utils/nerd-font-icons';
import { GitBranchWidget } from '../GitBranch';
import { GitChangesWidget } from '../GitChanges';
import { ModelWidget } from '../Model';
import { VersionWidget } from '../Version';

const nerdSettings: Settings = {
    ...DEFAULT_SETTINGS,
    nerdFontIcons: true
};

describe('Widget rendering with nerdFontIcons enabled', () => {
    it('ModelWidget should render with icon when enabled', () => {
        const widget = new ModelWidget();
        const context: RenderContext = { isPreview: true };
        const item: WidgetItem = { id: 'model', type: 'model' };

        const result = widget.render(item, context, nerdSettings);
        const icon = NERD_FONT_ICONS.model;
        expect(result).toBe(`${icon} Claude`);
    });

    it('ModelWidget rawValue should take priority over icon', () => {
        const widget = new ModelWidget();
        const context: RenderContext = { isPreview: true };
        const item: WidgetItem = { id: 'model', type: 'model', rawValue: true };

        const result = widget.render(item, context, nerdSettings);
        expect(result).toBe('Claude');
    });

    it('GitBranchWidget should render with icon instead of branch symbol', () => {
        const widget = new GitBranchWidget();
        const context: RenderContext = { isPreview: true };
        const item: WidgetItem = { id: 'git-branch', type: 'git-branch' };

        const result = widget.render(item, context, nerdSettings);
        const icon = NERD_FONT_ICONS['git-branch'];
        expect(result).toBe(`${icon} main`);
    });

    it('GitChangesWidget should render with icon prefix', () => {
        const widget = new GitChangesWidget();
        const context: RenderContext = { isPreview: true };
        const item: WidgetItem = { id: 'git-changes', type: 'git-changes' };

        const result = widget.render(item, context, nerdSettings);
        const icon = NERD_FONT_ICONS['git-changes'];
        expect(result).toBe(`${icon} (+42,-10)`);
    });

    it('VersionWidget should render with icon instead of v prefix', () => {
        const widget = new VersionWidget();
        const context: RenderContext = { isPreview: true };
        const item: WidgetItem = { id: 'version', type: 'version' };

        const result = widget.render(item, context, nerdSettings);
        const icon = NERD_FONT_ICONS.version;
        expect(result).toBe(`${icon} 1.0.0`);
    });

    it('VersionWidget should render with v prefix when icons disabled', () => {
        const widget = new VersionWidget();
        const context: RenderContext = { isPreview: true };
        const item: WidgetItem = { id: 'version', type: 'version' };

        const result = widget.render(item, context, DEFAULT_SETTINGS);
        expect(result).toBe('v1.0.0');
    });
});
