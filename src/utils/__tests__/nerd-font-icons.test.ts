import {
    describe,
    expect,
    it
} from 'vitest';

import {
    NERD_FONT_ICONS,
    formatWidgetLabel,
    getNerdFontIcon
} from '../nerd-font-icons';

describe('getNerdFontIcon', () => {
    it('should return an icon for all known widget types', () => {
        const knownTypes = [
            'model', 'git-branch', 'git-worktree', 'git-changes',
            'tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total',
            'context-length', 'context-percentage', 'context-percentage-usable',
            'session-clock', 'session-cost', 'block-timer',
            'terminal-width', 'version', 'output-style',
            'current-working-dir', 'claude-session-id'
        ];

        for (const type of knownTypes) {
            const icon = getNerdFontIcon(type);
            expect(icon, `Missing icon for widget type "${type}"`).toBeDefined();
            expect(typeof icon).toBe('string');
            expect(icon).toBeTruthy();
        }
    });

    it('should return undefined for unknown widget types', () => {
        expect(getNerdFontIcon('unknown-widget')).toBeUndefined();
        expect(getNerdFontIcon('')).toBeUndefined();
        expect(getNerdFontIcon('separator')).toBeUndefined();
    });

    it('should have entries for all documented widget types', () => {
        expect(Object.keys(NERD_FONT_ICONS).length).toBe(19);
    });
});

describe('formatWidgetLabel', () => {
    it('should return just the value when rawValue is true', () => {
        expect(formatWidgetLabel('model', 'Claude', 'Model: ', true, false)).toBe('Claude');
    });

    it('should return just the value when rawValue is true even with nerdFontIcons enabled', () => {
        expect(formatWidgetLabel('model', 'Claude', 'Model: ', true, true)).toBe('Claude');
    });

    it('should return textLabel + value when nerdFontIcons is false', () => {
        expect(formatWidgetLabel('model', 'Claude', 'Model: ', false, false)).toBe('Model: Claude');
    });

    it('should return textLabel + value when nerdFontIcons is undefined', () => {
        expect(formatWidgetLabel('model', 'Claude', 'Model: ', false, undefined)).toBe('Model: Claude');
    });

    it('should return icon + space + value when nerdFontIcons is true', () => {
        const result = formatWidgetLabel('model', 'Claude', 'Model: ', false, true);
        const expectedIcon = NERD_FONT_ICONS.model;
        expect(result).toBe(`${expectedIcon} Claude`);
    });

    it('should fall back to textLabel when widget type has no icon mapping', () => {
        const result = formatWidgetLabel('unknown-type', 'value', 'Label: ', false, true);
        expect(result).toBe('Label: value');
    });

    it('should work with Version widget (no-space label)', () => {
        const result = formatWidgetLabel('version', '1.0.0', 'v', false, false);
        expect(result).toBe('v1.0.0');
    });

    it('should replace Version prefix with icon when nerdFontIcons is true', () => {
        const result = formatWidgetLabel('version', '1.0.0', 'v', false, true);
        const expectedIcon = NERD_FONT_ICONS.version;
        expect(result).toBe(`${expectedIcon} 1.0.0`);
    });

    it('should work with git-branch symbol label', () => {
        const result = formatWidgetLabel('git-branch', 'main', '⎇ ', false, false);
        expect(result).toBe('⎇ main');
    });

    it('should replace git-branch symbol with icon when nerdFontIcons is true', () => {
        const result = formatWidgetLabel('git-branch', 'main', '⎇ ', false, true);
        const expectedIcon = NERD_FONT_ICONS['git-branch'];
        expect(result).toBe(`${expectedIcon} main`);
    });

    describe('edge cases', () => {
        it('should handle empty string value', () => {
            const result = formatWidgetLabel('model', '', 'Model: ', false, false);
            expect(result).toBe('Model: ');
        });

        it('should handle empty string value with nerdFontIcons enabled', () => {
            const result = formatWidgetLabel('model', '', 'Model: ', false, true);
            const expectedIcon = NERD_FONT_ICONS.model;
            expect(result).toBe(`${expectedIcon} `);
        });

        it('should handle empty string textLabel', () => {
            const result = formatWidgetLabel('model', 'Claude', '', false, false);
            expect(result).toBe('Claude');
        });

        it('should handle empty string textLabel with nerdFontIcons enabled', () => {
            // When nerdFontIcons is true, textLabel is ignored in favor of icon
            const result = formatWidgetLabel('model', 'Claude', '', false, true);
            const expectedIcon = NERD_FONT_ICONS.model;
            expect(result).toBe(`${expectedIcon} Claude`);
        });

        it('should return just the value when rawValue is true even for mapped widget type', () => {
            // Widget type exists in icon map, but rawValue takes priority
            const result = formatWidgetLabel('model', 'Claude', 'Model: ', true, true);
            expect(result).toBe('Claude');
        });

        it('should handle empty string value with rawValue true', () => {
            const result = formatWidgetLabel('model', '', 'Model: ', true, false);
            expect(result).toBe('');
        });

        it('should handle both empty string value and empty string textLabel', () => {
            const result = formatWidgetLabel('model', '', '', false, false);
            expect(result).toBe('');
        });

        it('should handle unknown widget type with empty textLabel and nerdFontIcons enabled', () => {
            // Falls back to textLabel (empty) + value since no icon mapping
            const result = formatWidgetLabel('unknown-type', 'value', '', false, true);
            expect(result).toBe('value');
        });
    });
});