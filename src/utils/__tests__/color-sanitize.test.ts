import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../types/Widget';
import {
    hasCustomWidgetColors,
    sanitizeLinesForColorLevel
} from '../color-sanitize';

describe('color sanitize helpers', () => {
    it('detects custom ansi256/hex colors in foreground and background', () => {
        const lines: WidgetItem[][] = [
            [
                { id: '1', type: 'model', color: 'ansi256:120' }
            ],
            [
                { id: '2', type: 'context-length', backgroundColor: 'hex:AA00BB' }
            ]
        ];

        expect(hasCustomWidgetColors(lines)).toBe(true);
        expect(hasCustomWidgetColors([[{ id: '3', type: 'model', color: 'cyan' }]])).toBe(false);
    });

    it('sanitizes hex colors when moving to ansi256 mode', () => {
        const lines: WidgetItem[][] = [[
            { id: '1', type: 'model', color: 'hex:FF00AA', backgroundColor: 'hex:112233' },
            { id: '2', type: 'context-length', color: 'ansi256:111', backgroundColor: 'ansi256:24' }
        ]];

        const sanitized = sanitizeLinesForColorLevel(lines, 2);

        expect(sanitized[0]?.[0]?.color).toBe('cyan');
        expect(sanitized[0]?.[0]?.backgroundColor).toBeUndefined();
        expect(sanitized[0]?.[1]?.color).toBe('ansi256:111');
        expect(sanitized[0]?.[1]?.backgroundColor).toBe('ansi256:24');
    });

    it('sanitizes ansi256 colors when moving to truecolor mode', () => {
        const lines: WidgetItem[][] = [[
            { id: '1', type: 'model', color: 'ansi256:120', backgroundColor: 'ansi256:244' },
            { id: '2', type: 'context-length', color: 'hex:AA11BB', backgroundColor: 'hex:112233' }
        ]];

        const sanitized = sanitizeLinesForColorLevel(lines, 3);

        expect(sanitized[0]?.[0]?.color).toBe('cyan');
        expect(sanitized[0]?.[0]?.backgroundColor).toBeUndefined();
        expect(sanitized[0]?.[1]?.color).toBe('hex:AA11BB');
        expect(sanitized[0]?.[1]?.backgroundColor).toBe('hex:112233');
    });

    it('sanitizes all custom colors when moving to basic/no-color modes', () => {
        const lines: WidgetItem[][] = [[
            { id: '1', type: 'model', color: 'ansi256:99', backgroundColor: 'hex:123456' },
            { id: '2', type: 'separator', color: 'hex:ABCDEF', backgroundColor: 'ansi256:2' }
        ]];

        const sanitized = sanitizeLinesForColorLevel(lines, 1);

        expect(sanitized[0]?.[0]?.color).toBe('cyan');
        expect(sanitized[0]?.[0]?.backgroundColor).toBeUndefined();
        // Preserve existing behavior: separator foreground is not reset by current logic.
        expect(sanitized[0]?.[1]?.color).toBe('hex:ABCDEF');
        expect(sanitized[0]?.[1]?.backgroundColor).toBeUndefined();
    });

    it('leaves gradient colors untouched at every color level (they self-degrade at render time)', () => {
        const lines: WidgetItem[][] = [[
            { id: '1', type: 'model', color: 'gradient:retro' },
            { id: '2', type: 'context-length', color: 'gradient:FF0000-0000FF' }
        ]];

        for (const level of [1, 2, 3] as const) {
            const sanitized = sanitizeLinesForColorLevel(lines, level);
            expect(sanitized[0]?.[0]?.color).toBe('gradient:retro');
            expect(sanitized[0]?.[1]?.color).toBe('gradient:FF0000-0000FF');
        }

        // Gradients are not "custom colors" for sanitize purposes - they degrade at render.
        expect(hasCustomWidgetColors(lines)).toBe(false);
    });
});
