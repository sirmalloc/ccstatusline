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
import { ModelFamilyColorsEditor } from '../model-family-colors-editor';

import {
    DOWN,
    ENTER,
    ESC,
    RIGHT,
    renderWidgetEditor
} from './helpers/widget-editor-harness';

const rawModel: WidgetItem = { id: 'm', type: 'model', rawValue: true };

function renderEditor(widget: WidgetItem, settings?: Settings) {
    return renderWidgetEditor(ModelFamilyColorsEditor, widget, settings);
}

describe('ModelFamilyColorsEditor', () => {
    it('samples the highlighted family and follows the cursor', async () => {
        const editor = renderEditor(rawModel);

        try {
            await editor.ready();
            const first = editor.takeOutput();
            expect(first).toContain('Model: family colors');
            expect(first).toContain('Sample: Opus');

            await editor.press(DOWN);
            expect(editor.takeOutput()).toContain('Sample: Sonnet');
        } finally {
            editor.cleanup();
        }
    });

    it('samples the label in the widget color around the family color, as the status line draws it', async () => {
        const editor = renderEditor({
            id: 'm',
            type: 'model',
            color: 'hex:112233',
            metadata: { 'familyColors': 'true', 'familyColor.opus': 'hex:ff8800' }
        });

        try {
            await editor.ready();
            expect(editor.takeColoredOutput()).toContain('Sample: \x1b[38;5;235mModel: \x1b[38;5;208mOpus');
        } finally {
            editor.cleanup();
        }
    });

    it('lists every family with its color', async () => {
        const editor = renderEditor(rawModel);

        try {
            await editor.ready();
            const output = editor.takeOutput();
            expect(output).toMatch(/opus\s+Magenta/);
            expect(output).toMatch(/sonnet\s+Cyan/);
            expect(output).toMatch(/haiku\s+Green/);
            expect(output).toMatch(/fable\s+Red/);
        } finally {
            editor.cleanup();
        }
    });

    it('shows the colors the status line draws at the Basic (16-color) level', async () => {
        // Named colors resolve through chalk, which tests run with colors off
        const originalLevel = chalk.level;
        chalk.level = 1;
        updateColorMap();
        const editor = renderEditor({ ...rawModel, metadata: { familyColors: 'true' } }, { ...DEFAULT_SETTINGS, colorLevel: 1 });

        try {
            await editor.ready();
            const output = editor.takeColoredOutput();
            expect(stripAnsi(output)).toMatch(/opus\s+Magenta/);
            expect(output).toContain('\x1b[35mMagenta');
            expect(output).toMatch(/Sample: .*\x1b\[35mOpus/);
        } finally {
            editor.cleanup();
            chalk.level = originalLevel;
            updateColorMap();
        }
    });

    it('colors nothing at the No Color level, as on the status line', async () => {
        const editor = renderEditor(
            { ...rawModel, metadata: { 'familyColors': 'true', 'familyColor.opus': 'hex:ff0000' } },
            { ...DEFAULT_SETTINGS, colorLevel: 0 }
        );

        try {
            await editor.ready();
            const output = editor.takeColoredOutput();
            expect(stripAnsi(output)).toMatch(/opus\s+#FF0000/);
            expect(output).toContain('Sample: Opus');
            expect(output).not.toContain('\x1b[38;2;255;0;0m');
        } finally {
            editor.cleanup();
        }
    });

    it('turns family colors on with Space and saves on Enter', async () => {
        const editor = renderEditor(rawModel);

        try {
            await editor.ready();
            await editor.press(' ', ENTER);
            expect(editor.savedMetadata()).toEqual({ familyColors: 'true' });
        } finally {
            editor.cleanup();
        }
    });

    it('cycles the highlighted family through the named colors', async () => {
        const editor = renderEditor(rawModel);

        try {
            await editor.ready();
            // Opus defaults to magenta; the named colors run ... blue, magenta, cyan ...
            await editor.press(RIGHT, ENTER);
            expect(editor.savedMetadata()?.['familyColor.opus']).toBe('cyan');
        } finally {
            editor.cleanup();
        }
    });

    it('takes a custom color with x', async () => {
        const editor = renderEditor(rawModel);

        try {
            await editor.ready();
            await editor.press(DOWN, DOWN, DOWN, 'x', 'f', 'f', '8', '8', '0', '0', ENTER, ENTER);
            expect(editor.savedMetadata()?.['familyColor.fable']).toBe('hex:ff8800');
        } finally {
            editor.cleanup();
        }
    });

    it('restores the default colors with d and keeps the on/off switch', async () => {
        const editor = renderEditor({ ...rawModel, metadata: { 'familyColors': 'true', 'familyColor.opus': 'hex:ff8800' } });

        try {
            await editor.ready();
            await editor.press('d', ENTER);
            expect(editor.savedMetadata()).toEqual({ familyColors: 'true' });
        } finally {
            editor.cleanup();
        }
    });

    it('cancels with ESC without saving', async () => {
        const editor = renderEditor(rawModel);

        try {
            await editor.ready();
            await editor.press(' ', ESC);
            expect(editor.onCancel).toHaveBeenCalledTimes(1);
            expect(editor.onComplete).not.toHaveBeenCalled();
        } finally {
            editor.cleanup();
        }
    });
});
