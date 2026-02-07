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
import { BlockTimerWidget } from '../BlockTimer';
import { GitBranchWidget } from '../GitBranch';
import { GitChangesWidget } from '../GitChanges';
import { ModelWidget } from '../Model';
import { VersionWidget } from '../Version';

const nerdSettings: Settings = {
    ...DEFAULT_SETTINGS,
    nerdFontIcons: true
};

describe('Widget rendering with nerdFontIcons enabled', () => {
    describe('ModelWidget', () => {
        const widget = new ModelWidget();

        function render(settings: Settings, rawValue = false, isPreview = false) {
            const context: RenderContext = {
                isPreview,
                data: { model: { id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4' } }
            };
            const item: WidgetItem = {
                id: 'model',
                type: 'model',
                rawValue
            };

            return widget.render(item, context, settings);
        }

        it('should render with text label when nerdFontIcons is false', () => {
            const result = render(DEFAULT_SETTINGS, false, true);
            expect(result).toBe('Model: Claude');
        });

        it('should render with icon when nerdFontIcons is true (preview)', () => {
            const result = render(nerdSettings, false, true);
            const icon = NERD_FONT_ICONS.model;
            expect(icon).toBeTruthy();
            expect(result).toBe(`${icon} Claude`);
        });

        it('should render with icon when nerdFontIcons is true (real data)', () => {
            const result = render(nerdSettings);
            const icon = NERD_FONT_ICONS.model;
            expect(icon).toBeTruthy();
            expect(result).toBe(`${icon} Claude Sonnet 4`);
        });

        it('should render raw value without icon even when nerdFontIcons is true', () => {
            const result = render(nerdSettings, true, true);
            expect(result).toBe('Claude');
        });
    });

    describe('GitBranchWidget', () => {
        const widget = new GitBranchWidget();

        function renderPreview(settings: Settings, rawValue = false) {
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = {
                id: 'git-branch',
                type: 'git-branch',
                rawValue
            };

            return widget.render(item, context, settings);
        }

        it('should render with unicode branch symbol when nerdFontIcons is false', () => {
            const result = renderPreview(DEFAULT_SETTINGS);
            expect(result).toBe('⎇ main');
        });

        it('should render with nerd font icon when nerdFontIcons is true', () => {
            const result = renderPreview(nerdSettings);
            const icon = NERD_FONT_ICONS['git-branch'];
            expect(icon).toBeTruthy();
            expect(result).toBe(`${icon} main`);
        });

        it('should render raw value without icon even when nerdFontIcons is true', () => {
            const result = renderPreview(nerdSettings, true);
            expect(result).toBe('main');
        });
    });

    describe('GitChangesWidget', () => {
        const widget = new GitChangesWidget();

        function renderPreview(settings: Settings) {
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = {
                id: 'git-changes',
                type: 'git-changes'
            };

            return widget.render(item, context, settings);
        }

        it('should render without icon prefix when nerdFontIcons is false', () => {
            const result = renderPreview(DEFAULT_SETTINGS);
            expect(result).toBe('(+42,-10)');
        });

        it('should render with icon prefix when nerdFontIcons is true', () => {
            const result = renderPreview(nerdSettings);
            const icon = NERD_FONT_ICONS['git-changes'];
            expect(icon).toBeTruthy();
            expect(result).toBe(`${icon} (+42,-10)`);
        });
    });

    describe('BlockTimerWidget', () => {
        const widget = new BlockTimerWidget();

        function renderPreview(settings: Settings, rawValue = false, displayMode?: string) {
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = {
                id: 'block-timer',
                type: 'block-timer',
                rawValue,
                metadata: displayMode ? { display: displayMode } : undefined
            };

            return widget.render(item, context, settings);
        }

        it('should render with text label when nerdFontIcons is false', () => {
            const result = renderPreview(DEFAULT_SETTINGS);
            expect(result).toBe('Block: 3hr 45m');
        });

        it('should render with icon when nerdFontIcons is true', () => {
            const result = renderPreview(nerdSettings);
            const icon = NERD_FONT_ICONS['block-timer'];
            expect(icon).toBeTruthy();
            expect(result).toBe(`${icon} 3hr 45m`);
        });

        it('should render progress mode with icon when nerdFontIcons is true', () => {
            const result = renderPreview(nerdSettings, false, 'progress');
            const icon = NERD_FONT_ICONS['block-timer'];
            expect(icon).toBeTruthy();
            expect(result).toContain(String(icon));
            expect(result).toContain('73.9%');
        });

        it('should render raw value without icon even when nerdFontIcons is true', () => {
            const result = renderPreview(nerdSettings, true);
            expect(result).toBe('3hr 45m');
        });
    });

    describe('VersionWidget', () => {
        const widget = new VersionWidget();

        function renderPreview(settings: Settings, rawValue = false) {
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = {
                id: 'version',
                type: 'version',
                rawValue
            };

            return widget.render(item, context, settings);
        }

        function renderWithData(settings: Settings, version: string) {
            const context: RenderContext = { data: { version } };
            const item: WidgetItem = {
                id: 'version',
                type: 'version'
            };

            return widget.render(item, context, settings);
        }

        it('should render with v prefix when nerdFontIcons is false', () => {
            const result = renderPreview(DEFAULT_SETTINGS);
            expect(result).toBe('v1.0.0');
        });

        it('should render with icon when nerdFontIcons is true', () => {
            const result = renderPreview(nerdSettings);
            const icon = NERD_FONT_ICONS.version;
            expect(icon).toBeTruthy();
            expect(result).toBe(`${icon} 1.0.0`);
        });

        it('should render real version data with icon when nerdFontIcons is true', () => {
            const result = renderWithData(nerdSettings, '2.0.25');
            const icon = NERD_FONT_ICONS.version;
            expect(icon).toBeTruthy();
            expect(result).toBe(`${icon} 2.0.25`);
        });

        it('should render real version data with v prefix when nerdFontIcons is false', () => {
            const result = renderWithData(DEFAULT_SETTINGS, '2.0.25');
            expect(result).toBe('v2.0.25');
        });

        it('should render raw value without icon even when nerdFontIcons is true', () => {
            const result = renderPreview(nerdSettings, true);
            expect(result).toBe('1.0.0');
        });
    });
});