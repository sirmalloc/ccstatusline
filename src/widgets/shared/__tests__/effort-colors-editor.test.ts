import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { updateColorMap } from '../../../utils/colors';
import { EffortColorsEditor } from '../effort-colors-editor';

import {
    DOWN,
    ENTER,
    ESC,
    LEFT,
    RIGHT,
    renderWidgetEditor
} from './helpers/widget-editor-harness';

function renderEditor(widget: WidgetItem, settings?: Settings) {
    return renderWidgetEditor(EffortColorsEditor, widget, settings);
}

const rawWithParens: WidgetItem = { id: 'e', type: 'thinking-effort', rawValue: true, metadata: { brackets: '()' } };

describe('EffortColorsEditor', () => {
    it('samples the highlighted level, with the widget\'s brackets, and follows the cursor', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await editor.ready();
            expect(editor.takeOutput()).toContain('Sample: (low)');

            await editor.press(DOWN);
            expect(editor.takeOutput()).toContain('Sample: (medium)');
        } finally {
            editor.cleanup();
        }
    });

    it('keeps sampling the last level while the brackets row is highlighted', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await editor.ready();
            await editor.press(DOWN, DOWN, DOWN, DOWN, DOWN);
            const output = editor.takeOutput();
            expect(output).toContain('Sample: (max)');
            expect(output).toMatch(/▶\s+brackets/);
        } finally {
            editor.cleanup();
        }
    });

    it('samples the label in the widget color around the level color, as the status line draws it', async () => {
        const editor = renderEditor({
            id: 'e',
            type: 'thinking-effort',
            color: 'hex:112233',
            metadata: { 'brackets': '()', 'bracketColor': 'widget', 'levelColors': 'true', 'levelColor.low': 'hex:ff8800' }
        });

        try {
            await editor.ready();
            expect(editor.takeColoredOutput()).toContain('Sample: \x1b[38;5;235m(Thinking: \x1b[38;5;208mlow\x1b[38;5;235m)');
        } finally {
            editor.cleanup();
        }
    });

    it('cycles the highlighted level through the named colors and saves on Enter', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await editor.ready();
            // high defaults to yellow; the named colors run ... green, yellow, blue ...
            await editor.press(DOWN, DOWN, RIGHT, ENTER);
            expect(editor.savedMetadata()?.['levelColor.high']).toBe('blue');
        } finally {
            editor.cleanup();
        }
    });

    it('cycles backwards with the left arrow', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await editor.ready();
            await editor.press(DOWN, DOWN, LEFT, ENTER);
            expect(editor.savedMetadata()?.['levelColor.high']).toBe('green');
        } finally {
            editor.cleanup();
        }
    });

    it('switches the brackets between matching the effort and the widget color', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await editor.ready();
            await editor.press(DOWN, DOWN, DOWN, DOWN, DOWN);
            expect(editor.takeOutput()).toContain('Match effort');

            await editor.press(RIGHT);
            expect(editor.takeOutput()).toContain('Widget color');

            await editor.press(ENTER);
            expect(editor.savedMetadata()?.bracketColor).toBe('widget');
        } finally {
            editor.cleanup();
        }
    });

    it('turns level colors on with Space', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await editor.ready();
            expect(editor.takeOutput()).toContain('Level colors: Off');

            await editor.press(' ');
            expect(editor.takeOutput()).toContain('Level colors: On');

            await editor.press(ENTER);
            expect(editor.savedMetadata()?.levelColors).toBe('true');
        } finally {
            editor.cleanup();
        }
    });

    it('names the default xhigh orange instead of showing its palette number', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await editor.ready();
            const output = editor.takeOutput();
            expect(output).toMatch(/xhigh\s+Orange/);
            expect(output).not.toContain('ansi256:208');
        } finally {
            editor.cleanup();
        }
    });

    it('shows the colors the status line draws at the Basic (16-color) level', async () => {
        // Named colors resolve through chalk, which tests run with colors off
        const originalLevel = chalk.level;
        chalk.level = 1;
        updateColorMap();
        const editor = renderEditor(
            { id: 'e', type: 'thinking-effort', rawValue: true, metadata: { levelColors: 'true' } },
            { ...DEFAULT_SETTINGS, colorLevel: 1 }
        );

        try {
            await editor.ready();
            await editor.press(DOWN, DOWN, DOWN);
            const output = editor.takeColoredOutput();
            // The default orange has no 16-color equivalent; bright magenta stands in
            expect(stripAnsi(output)).toMatch(/xhigh\s+Bright Magenta/);
            expect(output).toMatch(/Sample: .*\x1b\[95mxhigh/);
            expect(output).not.toContain('\x1b[38;5;');
        } finally {
            editor.cleanup();
            chalk.level = originalLevel;
            updateColorMap();
        }
    });

    it('colors nothing at the No Color level, as on the status line', async () => {
        const editor = renderEditor(
            { id: 'e', type: 'thinking-effort', rawValue: true, metadata: { 'levelColors': 'true', 'levelColor.low': 'hex:ff0000' } },
            { ...DEFAULT_SETTINGS, colorLevel: 0 }
        );

        try {
            await editor.ready();
            const output = editor.takeColoredOutput();
            expect(stripAnsi(output)).toMatch(/low\s+#FF0000/);
            expect(output).toContain('Sample: low');
            expect(output).not.toContain('\x1b[38;2;255;0;0m');
        } finally {
            editor.cleanup();
        }
    });

    it('labels custom colors the way Edit Colors does', async () => {
        const editor = renderEditor({
            ...rawWithParens,
            metadata: { ...rawWithParens.metadata, 'levelColor.high': 'ansi256:33', 'levelColor.max': 'hex:ff8800' }
        });

        try {
            await editor.ready();
            const output = editor.takeOutput();
            expect(output).toMatch(/high\s+ANSI 33/);
            expect(output).toMatch(/max\s+#FF8800/);
        } finally {
            editor.cleanup();
        }
    });

    it('sets a custom color typed after (x)', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await editor.ready();
            await editor.press(DOWN, DOWN, DOWN, 'x', '#ff8800', ENTER, ENTER);
            expect(editor.savedMetadata()?.['levelColor.xhigh']).toBe('hex:ff8800');
        } finally {
            editor.cleanup();
        }
    });

    it('keeps asking when the custom color is invalid, and ESC leaves the prompt', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await editor.ready();
            await editor.press('x', 'orange', ENTER);
            expect(editor.takeOutput()).toContain('Not a color');

            await editor.press(ESC);
            expect(editor.takeOutput()).toContain('Sample: (low)');
            expect(editor.onCancel).not.toHaveBeenCalled();

            await editor.press(ENTER);
            expect(editor.savedMetadata()?.['levelColor.low']).toBeUndefined();
        } finally {
            editor.cleanup();
        }
    });

    it('restores the default colors with (d) but leaves level colors on', async () => {
        const editor = renderEditor({
            ...rawWithParens,
            metadata: { 'brackets': '()', 'levelColors': 'true', 'levelColor.low': 'blue', 'bracketColor': 'widget' }
        });

        try {
            await editor.ready();
            await editor.press('d', ENTER);
            expect(editor.savedMetadata()).toEqual({ brackets: '()', levelColors: 'true' });
        } finally {
            editor.cleanup();
        }
    });

    it('ignores its letter shortcuts when ctrl or alt is held', async () => {
        const editor = renderEditor({ ...rawWithParens, metadata: { 'brackets': '()', 'levelColor.low': 'blue' } });

        try {
            await editor.ready();
            // ctrl+d, alt+d (ESC d), alt+x, ctrl+space (NUL)
            await editor.pressIgnored('\x04', '\x1bd', '\x1bx', '\x00');
            expect(editor.takeOutput()).not.toContain('Custom color for');

            await editor.press(ENTER);
            expect(editor.savedMetadata()).toEqual({ 'brackets': '()', 'levelColor.low': 'blue' });
        } finally {
            editor.cleanup();
        }
    });

    it('discards changes on ESC', async () => {
        const editor = renderEditor(rawWithParens);

        try {
            await editor.ready();
            await editor.press(RIGHT, ' ', ESC);
            expect(editor.onCancel).toHaveBeenCalledTimes(1);
            expect(editor.onComplete).not.toHaveBeenCalled();
        } finally {
            editor.cleanup();
        }
    });
});
