import chalk from 'chalk';
import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { updateColorMap } from '../../../utils/colors';
import { ColorMenu } from '../ColorMenu';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 160;
    rows = 40;

    setRawMode() {
        return this;
    }

    ref() {
        return this;
    }

    unref() {
        return this;
    }
}

// Lets work React has already queued run first. Its scheduler runs on
// setImmediate, and it attaches input listeners in an effect just after
// drawing a frame, so a key sent as soon as the frame shows could be lost.
async function letReactCatchUp() {
    for (let turn = 0; turn < 2; turn++) {
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
    }
}

// Polls until the condition holds; a fixed delay races Ink on a busy machine
async function waitUntil(condition: () => boolean, timeoutMs = 3000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    do {
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
        if (condition()) {
            await letReactCatchUp();
            return true;
        }
    } while (Date.now() < deadline);
    return false;
}

// Long enough for a key to be handled, for checks that it did nothing
function settle() {
    return new Promise((resolve) => {
        setTimeout(resolve, 150);
    });
}

const ESC = '\x1b';
const ENTER = '\r';
const DOWN = '\x1b[B';
const RIGHT = '\x1b[C';
const LEFT = '\x1b[D';
const PICKER_TITLE = 'Select ANSI 256 Color';

function renderMenu(widgets: WidgetItem[], settings: Partial<Settings> = {}, columns = 160) {
    const stdin = new MockTtyStream() as unknown as NodeJS.ReadStream;
    const stdout = new MockTtyStream();
    stdout.columns = columns;
    const stderr = new MockTtyStream();
    const chunks: string[] = [];
    stdout.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });
    const onUpdate = vi.fn<(widgets: WidgetItem[]) => void>();

    const instance = render(
        React.createElement(ColorMenu, {
            widgets,
            settings: { ...DEFAULT_SETTINGS, colorLevel: 2, ...settings },
            onUpdate,
            onBack: vi.fn()
        }),
        {
            stdin,
            stdout: stdout as unknown as NodeJS.WriteStream,
            stderr: stderr as unknown as NodeJS.WriteStream,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        }
    );

    const output = () => stripAnsi(chunks.join(''));

    // The menu is drawn and listening for keys
    const ready = async () => {
        if (!(await waitUntil(() => chunks.length > 0))) {
            throw new Error('The menu never drew');
        }
    };

    return {
        // Every key here redraws the screen, so each waits for that before the
        // next key goes out
        press: async (...inputs: string[]) => {
            await ready();
            for (const input of inputs) {
                const drawn = chunks.length;
                stdin.write(input);
                if (!(await waitUntil(() => chunks.length > drawn))) {
                    throw new Error(`No redraw after ${JSON.stringify(input)}`);
                }
            }
        },
        // For keys that should do nothing
        pressIgnored: async (...inputs: string[]) => {
            await ready();
            for (const input of inputs) {
                stdin.write(input);
            }
            await settle();
        },
        lastUpdate: () => onUpdate.mock.calls.at(-1)?.[0],
        // The latest frame of whichever screen was drawn last
        latestScreen: () => {
            const text = output();
            const start = Math.max(text.lastIndexOf(PICKER_TITLE), text.lastIndexOf('Configure Colors'));
            return text.slice(start);
        },
        cleanup: () => {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    };
}

const orangeModel: WidgetItem = { id: '1', type: 'model', color: 'ansi256:208' };

describe('ColorMenu 256-color grid', () => {
    // Named colors resolve through chalk, which tests run with colors off
    const originalLevel = chalk.level;

    beforeEach(() => {
        chalk.level = 3;
        updateColorMap();
    });

    afterEach(() => {
        chalk.level = originalLevel;
        updateColorMap();
    });

    it('opens with (a) at 256 colors and at truecolor, on the current color', async () => {
        for (const colorLevel of [2, 3] as const) {
            const menu = renderMenu([orangeModel], { colorLevel });
            try {
                await menu.press('a');
                const screen = menu.latestScreen();
                expect(screen).toContain(PICKER_TITLE);
                expect(screen).toContain('ANSI 208  #FF8700');
            } finally {
                menu.cleanup();
            }
        }
    });

    it('is not offered at 16 colors', async () => {
        const menu = renderMenu([orangeModel], { colorLevel: 1 });
        try {
            await menu.pressIgnored('a');
            expect(menu.latestScreen()).not.toContain(PICKER_TITLE);
            expect(menu.latestScreen()).not.toContain('(a)nsi256');
        } finally {
            menu.cleanup();
        }
    });

    it('lists (a)nsi256 next to (h)ex at truecolor', async () => {
        const menu = renderMenu([orangeModel], { colorLevel: 3 });
        try {
            await menu.press();
            expect(menu.latestScreen()).toContain('(h)ex, (a)nsi256,');
        } finally {
            menu.cleanup();
        }
    });

    it('leaves the settings untouched when opened on a palette color', async () => {
        const widgets: WidgetItem[] = [
            // The model's default color, cyan
            { id: '1', type: 'model' },
            { id: '1', type: 'model', color: 'red' },
            { id: '1', type: 'model', color: 'ansi256:1' },
            { id: '1', type: 'model', color: 'hex:FF8800' }
        ];
        for (const colorLevel of [2, 3] as const) {
            for (const widget of widgets) {
                const menu = renderMenu([widget], { colorLevel });
                try {
                    await menu.press('a', ENTER);
                    expect(menu.lastUpdate() ?? [widget]).toEqual([widget]);
                } finally {
                    menu.cleanup();
                }
            }
        }
    });

    it('starts a named color on the palette color it is drawn with', async () => {
        const defaultColored: WidgetItem = { id: '1', type: 'model' };
        const green: WidgetItem = { id: '1', type: 'model', color: 'green' };
        const starts: [WidgetItem, 2 | 3, string][] = [
            // The model's default cyan is palette color 30 at 256 colors
            [defaultColored, 2, 'ANSI 30  #008787'],
            [green, 2, 'ANSI 70  #5FAF00'],
            // At truecolor green is #4E9A06, nearest to palette color 64
            [green, 3, 'ANSI 64  #5F8700']
        ];
        for (const [widget, colorLevel, label] of starts) {
            const menu = renderMenu([widget], { colorLevel });
            try {
                await menu.press('a');
                expect(menu.latestScreen()).toContain(label);
            } finally {
                menu.cleanup();
            }
        }
    });

    it('saves a basic color as the palette color its swatch shows', async () => {
        const menu = renderMenu([orangeModel]);
        try {
            await menu.press('a', '1');
            expect(menu.latestScreen()).toContain('ANSI 1  Red');
            expect(menu.lastUpdate()?.[0]?.color).toBe('ansi256:1');
        } finally {
            menu.cleanup();
        }
    });

    it('starts a hex color on the nearest palette color, applying it once the cursor moves', async () => {
        const menu = renderMenu([{ id: '1', type: 'model', color: 'hex:FF8800' }], { colorLevel: 3 });
        try {
            await menu.press('a');
            expect(menu.latestScreen()).toContain('ANSI 208  #FF8700');
            expect(menu.lastUpdate()).toBeUndefined();
            await menu.press(RIGHT, LEFT);
            expect(menu.lastUpdate()?.[0]?.color).toBe('ansi256:208');
        } finally {
            menu.cleanup();
        }
    });

    it('applies each highlighted color as the cursor moves, for the live preview', async () => {
        const menu = renderMenu([orangeModel]);
        try {
            await menu.press('a', RIGHT);
            expect(menu.lastUpdate()?.[0]?.color).toBe('ansi256:209');
            await menu.press(DOWN);
            expect(menu.lastUpdate()?.[0]?.color).toBe('ansi256:215');
            expect(menu.latestScreen()).toContain('ANSI 215  #FFAF5F');
        } finally {
            menu.cleanup();
        }
    });

    it('jumps to a typed color number', async () => {
        const menu = renderMenu([orangeModel]);
        try {
            await menu.press('a', '4', '5');
            expect(menu.lastUpdate()?.[0]?.color).toBe('ansi256:45');
            expect(menu.latestScreen()).toContain('ANSI 45  #00D7FF');
        } finally {
            menu.cleanup();
        }
    });

    it('keeps the highlighted color on Enter', async () => {
        const menu = renderMenu([orangeModel]);
        try {
            await menu.press('a', RIGHT, ENTER);
            expect(menu.lastUpdate()?.[0]?.color).toBe('ansi256:209');
            expect(menu.latestScreen()).toContain('Configure Colors');
        } finally {
            menu.cleanup();
        }
    });

    it('restores the original color on ESC', async () => {
        const menu = renderMenu([orangeModel]);
        try {
            await menu.press('a', RIGHT, ESC);
            expect(menu.lastUpdate()).toEqual([orangeModel]);
            expect(menu.latestScreen()).toContain('Configure Colors');
        } finally {
            menu.cleanup();
        }
    });

    it('sets the background in background mode, saving basic colors as ansi256 values', async () => {
        const widget: WidgetItem = { id: '1', type: 'model', color: 'cyan', backgroundColor: 'bgRed' };
        const menu = renderMenu([widget]);
        try {
            await menu.press('f', 'a', '2');
            expect(menu.lastUpdate()?.[0]).toEqual({ ...widget, backgroundColor: 'ansi256:2' });
        } finally {
            menu.cleanup();
        }
    });

    it('marks the highlighted color with narrower cells in a narrow terminal', async () => {
        const wide = renderMenu([orangeModel]);
        const narrow = renderMenu([orangeModel], {}, 60);
        try {
            await wide.press('a');
            await narrow.press('a');
            expect(wide.latestScreen()).toContain('[]');
            expect(narrow.latestScreen()).not.toContain('[]');
            expect(narrow.latestScreen()).toContain('*');
        } finally {
            wide.cleanup();
            narrow.cleanup();
        }
    });
});
