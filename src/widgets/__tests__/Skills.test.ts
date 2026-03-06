import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { SkillsWidget } from '../Skills';

function render(item: WidgetItem, context: RenderContext): string | null {
    return new SkillsWidget().render(item, context, DEFAULT_SETTINGS);
}

describe('SkillsWidget', () => {
    it('uses v as the mode toggle keybind', () => {
        const widget = new SkillsWidget();
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 'v', label: '(v)iew: last/count/list', action: 'cycle-mode' },
            { key: 'h', label: '(h)ide when empty', action: 'toggle-hide-empty' },
            { key: 'l', label: '(l)imit', action: 'edit-list-limit' }
        ]);
    });

    it('cycles mode current -> count -> list -> current', () => {
        const widget = new SkillsWidget();
        const base: WidgetItem = { id: 'skills', type: 'skills' };
        const count = widget.handleEditorAction('cycle-mode', base);
        const list = widget.handleEditorAction('cycle-mode', count ?? base);
        const current = widget.handleEditorAction('cycle-mode', list ?? base);

        expect(count?.metadata?.mode).toBe('count');
        expect(list?.metadata?.mode).toBe('list');
        expect(current?.metadata?.mode).toBe('current');
    });

    it('toggles hide-when-empty metadata', () => {
        const widget = new SkillsWidget();
        const base: WidgetItem = { id: 'skills', type: 'skills' };
        const hidden = widget.handleEditorAction('toggle-hide-empty', base);
        const shown = widget.handleEditorAction('toggle-hide-empty', hidden ?? base);

        expect(hidden?.metadata?.hideWhenEmpty).toBe('true');
        expect(shown?.metadata?.hideWhenEmpty).toBe('false');
    });

    it('shows hide-when-empty in editor modifier text when enabled', () => {
        const widget = new SkillsWidget();
        const display = widget.getEditorDisplay({
            id: 'skills',
            type: 'skills',
            metadata: { hideWhenEmpty: 'true' }
        });

        expect(display.modifierText).toBe('(last used, hide when empty)');
    });

    it('shows list limit in editor modifier text when configured', () => {
        const widget = new SkillsWidget();
        const display = widget.getEditorDisplay({
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'list', listLimit: '2' }
        });

        expect(display.modifierText).toBe('(unique list, limit: 2)');
    });

    it('renders current, count, and list modes from skills metrics', () => {
        const context: RenderContext = {
            skillsMetrics: {
                totalInvocations: 3,
                uniqueSkills: ['commit', 'review-pr'],
                lastSkill: 'review-pr'
            }
        };

        expect(render({ id: 'skills', type: 'skills' }, context)).toBe('Skill: review-pr');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'count' } }, context)).toBe('Skills: 3');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'list' } }, context)).toBe('Skills: commit, review-pr');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'list', listLimit: '1' } }, context)).toBe('Skills: commit');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'list', listLimit: '0' } }, context)).toBe('Skills: commit, review-pr');
    });

    it('shows non-hidden empty outputs by default', () => {
        const context: RenderContext = {
            skillsMetrics: {
                totalInvocations: 0,
                uniqueSkills: [],
                lastSkill: null
            }
        };

        expect(render({ id: 'skills', type: 'skills' }, context)).toBe('Skill: none');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'count' } }, context)).toBe('Skills: 0');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'list' } }, context)).toBe('Skills: none');
    });

    it('hides empty outputs when hide-when-empty is enabled', () => {
        const context: RenderContext = {
            skillsMetrics: {
                totalInvocations: 0,
                uniqueSkills: [],
                lastSkill: null
            }
        };

        expect(render({
            id: 'skills',
            type: 'skills',
            metadata: { hideWhenEmpty: 'true' }
        }, context)).toBeNull();
        expect(render({
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'count', hideWhenEmpty: 'true' }
        }, context)).toBeNull();
        expect(render({
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'list', hideWhenEmpty: 'true' }
        }, context)).toBeNull();
    });
});