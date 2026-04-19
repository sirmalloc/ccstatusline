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
        expect(widget.getCustomKeybinds({ id: 'skills', type: 'skills' })).toEqual([
            { key: 'v', label: '(v)iew: current/count/list/activity', action: 'cycle-mode' },
            { key: 'h', label: '(h)ide when empty', action: 'toggle-hide-empty' }
        ]);
        expect(widget.getCustomKeybinds({
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'list' }
        })).toEqual([
            { key: 'v', label: '(v)iew: current/count/list/activity', action: 'cycle-mode' },
            { key: 'h', label: '(h)ide when empty', action: 'toggle-hide-empty' },
            { key: 'l', label: '(l)imit', action: 'edit-list-limit' }
        ]);
        expect(widget.getCustomKeybinds({
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'activity' }
        }).some(k => k.key === 'l')).toBe(true);
    });

    it('cycles mode current -> count -> list -> activity -> current', () => {
        const widget = new SkillsWidget();
        const base: WidgetItem = { id: 'skills', type: 'skills' };
        const count = widget.handleEditorAction('cycle-mode', base);
        const list = widget.handleEditorAction('cycle-mode', count ?? base);
        const activity = widget.handleEditorAction('cycle-mode', list ?? base);
        const current = widget.handleEditorAction('cycle-mode', activity ?? base);

        expect(count?.metadata?.mode).toBe('count');
        expect(list?.metadata?.mode).toBe('list');
        expect(activity?.metadata?.mode).toBe('activity');
        expect(current?.metadata?.mode).toBe('current');
    });

    it('keeps list limit when cycling list -> activity; drops when leaving both', () => {
        const widget = new SkillsWidget();
        const afterList = widget.handleEditorAction('cycle-mode', {
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'list', listLimit: '2' }
        });
        expect(afterList?.metadata?.mode).toBe('activity');
        expect(afterList?.metadata?.listLimit).toBe('2');

        const afterActivity = widget.handleEditorAction('cycle-mode', afterList ?? { id: 'skills', type: 'skills' });
        expect(afterActivity?.metadata?.mode).toBe('current');
        expect(afterActivity?.metadata?.listLimit).toBeUndefined();
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

        expect(display.modifierText).toBe('(current, hide when empty)');
    });

    it('shows list limit in editor modifier text when configured', () => {
        const widget = new SkillsWidget();
        const display = widget.getEditorDisplay({
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'list', listLimit: '2' }
        });

        expect(display.modifierText).toBe('(list, limit: 2)');
    });

    it('renders current, count, and list modes from skills metrics', () => {
        const context: RenderContext = {
            skillsMetrics: {
                totalInvocations: 3,
                uniqueSkills: ['commit', 'review-pr'],
                lastSkill: 'review-pr',
                recent: ['commit', 'review-pr', 'commit']
            }
        };

        expect(render({ id: 'skills', type: 'skills' }, context)).toBe('Skill: review-pr');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'count' } }, context)).toBe('Skills: 3');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'list' } }, context)).toBe('Skills: commit, review-pr');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'list', listLimit: '1' } }, context)).toBe('Skills: commit');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'list', listLimit: '0' } }, context)).toBe('Skills: commit, review-pr');
    });

    it('renders activity mode as time-ordered recent invocations joined by →', () => {
        const context: RenderContext = {
            skillsMetrics: {
                totalInvocations: 3,
                uniqueSkills: ['commit', 'review-pr'],
                lastSkill: 'commit',
                recent: ['commit', 'review-pr', 'commit']
            }
        };
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'activity' } }, context))
            .toBe('Skills: commit → review-pr → commit');
    });

    it('activity mode respects listLimit as a tail window', () => {
        const context: RenderContext = {
            skillsMetrics: {
                totalInvocations: 5,
                uniqueSkills: ['a', 'b', 'c'],
                lastSkill: 'c',
                recent: ['a', 'b', 'c', 'a', 'c']
            }
        };
        expect(render({
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'activity', listLimit: '2' }
        }, context)).toBe('Skills: a → c');
    });

    it('activity mode with empty recent returns "Skills: none" / null per hideWhenEmpty', () => {
        const empty: RenderContext = { skillsMetrics: { totalInvocations: 0, uniqueSkills: [], lastSkill: null, recent: [] } };
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'activity' } }, empty))
            .toBe('Skills: none');
        expect(render({
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'activity', hideWhenEmpty: 'true' }
        }, empty)).toBeNull();
    });

    it('shows non-hidden empty outputs by default', () => {
        const context: RenderContext = {
            skillsMetrics: {
                totalInvocations: 0,
                uniqueSkills: [],
                lastSkill: null,
                recent: []
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
                lastSkill: null,
                recent: []
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