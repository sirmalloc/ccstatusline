import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import type { EnvironmentData } from '../../utils/environment-counter';
import { EnvironmentWidget } from '../Environment';

function renderWithContext(widget: EnvironmentWidget, item: WidgetItem, context: RenderContext): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

const fullEnvData: EnvironmentData = {
    claudeMdCount: 3,
    mcpCount: 2,
    rulesCount: 5,
    hooksCount: 1
};

const emptyEnvData: EnvironmentData = {
    claudeMdCount: 0,
    mcpCount: 0,
    rulesCount: 0,
    hooksCount: 0
};

describe('EnvironmentWidget', () => {
    it('returns null when all counts are zero', () => {
        const widget = new EnvironmentWidget();
        const output = renderWithContext(widget, { id: 'env', type: 'environment' }, { environmentData: emptyEnvData });
        expect(output).toBeNull();
    });

    it('returns null when environmentData is missing', () => {
        const widget = new EnvironmentWidget();
        const output = renderWithContext(widget, { id: 'env', type: 'environment' }, {});
        expect(output).toBeNull();
    });

    it('shows only non-zero items', () => {
        const widget = new EnvironmentWidget();
        const partialData: EnvironmentData = {
            claudeMdCount: 2,
            mcpCount: 0,
            rulesCount: 3,
            hooksCount: 0
        };
        const output = renderWithContext(widget, { id: 'env', type: 'environment' }, { environmentData: partialData });
        expect(output).toBe('Env: 2 CLAUDE.md | 3 rules');
    });

    it('renders labeled mode with Env: prefix', () => {
        const widget = new EnvironmentWidget();
        const output = renderWithContext(widget, { id: 'env', type: 'environment' }, { environmentData: fullEnvData });
        expect(output).toBe('Env: 3 CLAUDE.md | 2 MCP | 5 rules | 1 hook');
    });

    it('renders rawValue mode without Env: prefix', () => {
        const widget = new EnvironmentWidget();
        const output = renderWithContext(widget, { id: 'env', type: 'environment', rawValue: true }, { environmentData: fullEnvData });
        expect(output).toBe('3 CLAUDE.md | 2 MCP | 5 rules | 1 hook');
    });

    it('returns preview text in preview mode', () => {
        const widget = new EnvironmentWidget();
        const output = renderWithContext(widget, { id: 'env', type: 'environment' }, { isPreview: true });
        expect(output).toContain('Env:');
        expect(output).toContain('3 CLAUDE.md');
        expect(output).toContain('2 MCP');
        expect(output).toContain('5 rules');
        expect(output).toContain('1 hook');
    });

    it('applies maxWidth truncation', () => {
        const widget = new EnvironmentWidget();
        const output = renderWithContext(
            widget,
            { id: 'env', type: 'environment', maxWidth: 20 },
            { environmentData: fullEnvData }
        );
        expect(output).not.toBeNull();
        expect(output?.endsWith('...')).toBe(true);
    });

    it('pluralizes hooks correctly', () => {
        const widget = new EnvironmentWidget();
        const multiHooks: EnvironmentData = { claudeMdCount: 0, mcpCount: 0, rulesCount: 0, hooksCount: 3 };
        const output = renderWithContext(widget, { id: 'env', type: 'environment' }, { environmentData: multiHooks });
        expect(output).toBe('Env: 3 hooks');
    });

    it('supports width keybind', () => {
        const widget = new EnvironmentWidget();
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 'w', label: '(w)idth', action: 'edit-width' }
        ]);
    });
});
