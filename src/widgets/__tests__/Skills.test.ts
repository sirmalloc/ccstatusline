import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    SkillsMetrics,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { SkillsWidget } from '../Skills';

function createContext(skillsMetrics: SkillsMetrics | null): RenderContext {
    return {
        data: { session_id: 'test-session' },
        skillsMetrics
    };
}

function createItem(rawValue = false, mode?: string): WidgetItem {
    return {
        id: 'skills',
        type: 'skills',
        rawValue,
        metadata: mode ? { mode } : undefined
    };
}

function createMetrics(
    skills: string[],
    lastSkill: string | null = skills[skills.length - 1] ?? null
): SkillsMetrics {
    return {
        totalInvocations: skills.length,
        uniqueSkills: [...new Set(skills)],
        lastSkill,
        invocations: skills.map((skill, i) => ({
            timestamp: new Date(Date.now() + i * 1000).toISOString(),
            session_id: 'test-session',
            skill,
            args: ''
        }))
    };
}

describe('SkillsWidget', () => {
    const widget = new SkillsWidget();

    describe('render in current mode (default)', () => {
        it('should show last skill with prefix', () => {
            const context = createContext(createMetrics(['commit', 'review-pr']));
            const result = widget.render(createItem(), context, DEFAULT_SETTINGS);
            expect(result).toBe('Skill: review-pr');
        });

        it('should show last skill raw value', () => {
            const context = createContext(createMetrics(['commit', 'review-pr']));
            const result = widget.render(createItem(true), context, DEFAULT_SETTINGS);
            expect(result).toBe('review-pr');
        });

        it('should return null when no skills', () => {
            const context = createContext(createMetrics([]));
            const result = widget.render(createItem(), context, DEFAULT_SETTINGS);
            expect(result).toBeNull();
        });
    });

    describe('render in count mode', () => {
        it('should show total count with prefix', () => {
            const context = createContext(createMetrics(['commit', 'review-pr', 'commit']));
            const result = widget.render(createItem(false, 'count'), context, DEFAULT_SETTINGS);
            expect(result).toBe('Skills: 3');
        });

        it('should show total count raw value', () => {
            const context = createContext(createMetrics(['commit', 'review-pr', 'commit']));
            const result = widget.render(createItem(true, 'count'), context, DEFAULT_SETTINGS);
            expect(result).toBe('3');
        });
    });

    describe('render in list mode', () => {
        it('should show unique skills with prefix', () => {
            const context = createContext(createMetrics(['commit', 'review-pr', 'commit']));
            const result = widget.render(createItem(false, 'list'), context, DEFAULT_SETTINGS);
            expect(result).toBe('Skills: commit, review-pr');
        });

        it('should show unique skills raw value', () => {
            const context = createContext(createMetrics(['commit', 'review-pr', 'commit']));
            const result = widget.render(createItem(true, 'list'), context, DEFAULT_SETTINGS);
            expect(result).toBe('commit, review-pr');
        });
    });

    describe('preview mode', () => {
        it('should show preview for current mode', () => {
            const context: RenderContext = { isPreview: true };
            const result = widget.render(createItem(), context, DEFAULT_SETTINGS);
            expect(result).toBe('Skill: commit');
        });

        it('should show preview for count mode', () => {
            const context: RenderContext = { isPreview: true };
            const result = widget.render(createItem(false, 'count'), context, DEFAULT_SETTINGS);
            expect(result).toBe('Skills: 5');
        });

        it('should show preview for list mode', () => {
            const context: RenderContext = { isPreview: true };
            const result = widget.render(createItem(false, 'list'), context, DEFAULT_SETTINGS);
            expect(result).toBe('Skills: commit, review-pr');
        });
    });

    describe('handleEditorAction', () => {
        it('should cycle through modes', () => {
            const item = createItem(false, 'current');

            const result1 = widget.handleEditorAction('cycle-mode', item);
            expect(result1?.metadata?.mode).toBe('count');

            const result2 = widget.handleEditorAction('cycle-mode', result1!);
            expect(result2?.metadata?.mode).toBe('list');

            const result3 = widget.handleEditorAction('cycle-mode', result2!);
            expect(result3?.metadata?.mode).toBe('current');
        });
    });

    describe('getEditorDisplay', () => {
        it('should show modifier for current mode', () => {
            const display = widget.getEditorDisplay(createItem(false, 'current'));
            expect(display.modifierText).toBe('(last used)');
        });

        it('should show modifier for count mode', () => {
            const display = widget.getEditorDisplay(createItem(false, 'count'));
            expect(display.modifierText).toBe('(total count)');
        });

        it('should show modifier for list mode', () => {
            const display = widget.getEditorDisplay(createItem(false, 'list'));
            expect(display.modifierText).toBe('(unique list)');
        });
    });

    describe('widget properties', () => {
        it('should return correct default color', () => {
            expect(widget.getDefaultColor()).toBe('magenta');
        });

        it('should support raw value', () => {
            expect(widget.supportsRawValue()).toBe(true);
        });

        it('should support colors', () => {
            expect(widget.supportsColors(createItem())).toBe(true);
        });

        it('should have custom keybinds', () => {
            const keybinds = widget.getCustomKeybinds();
            expect(keybinds).toHaveLength(1);
            expect(keybinds[0]?.key).toBe('m');
            expect(keybinds[0]?.action).toBe('cycle-mode');
        });
    });
});
