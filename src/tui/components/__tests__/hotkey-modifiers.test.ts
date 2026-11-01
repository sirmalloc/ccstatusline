import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it,
    vi,
    type Mock
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { ColorMenu } from '../ColorMenu';
import { GlobalOverridesMenu } from '../GlobalOverridesMenu';
import { HideStatesEditor } from '../HideStatesEditor';
import { LineSelector } from '../LineSelector';
import { PowerlineSeparatorEditor } from '../PowerlineSeparatorEditor';
import { PowerlineSetup } from '../PowerlineSetup';
import { PowerlineThemeSelector } from '../PowerlineThemeSelector';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 120;
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

interface CapturedWriteStream extends NodeJS.WriteStream { getOutput: () => string }

function createMockStdout(): CapturedWriteStream {
    const stream = new MockTtyStream();
    const chunks: string[] = [];

    stream.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });

    return Object.assign(stream as unknown as NodeJS.WriteStream, {
        getOutput() {
            return chunks.join('');
        }
    });
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

const ENTER = '\r';

// The bytes a terminal sends: ctrl+letter is the letter's control character
// (ctrl+space is NUL), alt/option+key is ESC followed by the key
const MODIFIED: Record<string, (key: string) => string> = {
    ctrl: key => (key === ' ' ? '\x00' : String.fromCharCode(key.charCodeAt(0) - 96)),
    alt: key => `\x1b${key}`
};

const powerlineOn = { ...DEFAULT_SETTINGS, powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true } };
const hideStates = [{ key: 'empty', label: 'When empty' }];
const plainWidget: WidgetItem = { id: '1', type: 'model' };

interface ShortcutCase {
    name: string;
    shortcut: string;
    // Keys pressed after the shortcut to make its effect observable
    then?: string[];
    element: (spy: Mock) => React.ReactElement;
    fired: (spy: Mock, output: string) => boolean;
}

const calledSpy = (spy: Mock) => spy.mock.calls.length > 0;

const cases: ShortcutCase[] = [
    {
        name: 'Edit Colors: (b)old',
        shortcut: 'b',
        element: spy => React.createElement(ColorMenu, { widgets: [plainWidget], settings: DEFAULT_SETTINGS, onUpdate: spy, onBack: vi.fn() }),
        fired: calledSpy
    },
    {
        // Not (i)nherit: ctrl+i is the same byte as Tab, so it can't be told apart
        name: 'Global Overrides: (b)ackground cycle',
        shortcut: 'b',
        element: spy => React.createElement(GlobalOverridesMenu, { settings: DEFAULT_SETTINGS, onUpdate: spy, onBack: vi.fn() }),
        fired: calledSpy
    },
    {
        name: 'Powerline Setup: (t)oggle',
        shortcut: 't',
        element: spy => React.createElement(PowerlineSetup, {
            settings: powerlineOn,
            powerlineFontStatus: { installed: true },
            onUpdate: spy,
            onBack: vi.fn(),
            onInstallFonts: vi.fn(),
            installingFonts: false,
            fontInstallMessage: null,
            onClearMessage: vi.fn()
        }),
        fired: calledSpy
    },
    {
        name: 'Powerline themes: (c)ustomize',
        shortcut: 'c',
        element: spy => React.createElement(PowerlineThemeSelector, {
            settings: { ...powerlineOn, powerline: { ...powerlineOn.powerline, theme: 'nord' } },
            onUpdate: spy,
            onBack: vi.fn()
        }),
        fired: (_spy, output) => output.includes('Confirm Customization')
    },
    {
        name: 'Powerline separators: (a)dd',
        shortcut: 'a',
        element: spy => React.createElement(PowerlineSeparatorEditor, { settings: powerlineOn, mode: 'separator', onUpdate: spy, onBack: vi.fn() }),
        fired: calledSpy
    },
    {
        name: 'Line selector: (a)ppend line',
        shortcut: 'a',
        element: spy => React.createElement(LineSelector, {
            lines: [[plainWidget]],
            onSelect: vi.fn(),
            onBack: vi.fn(),
            onLinesUpdate: spy,
            settings: DEFAULT_SETTINGS,
            allowEditing: true
        }),
        fired: calledSpy
    },
    {
        name: 'Hide states: Space toggles',
        shortcut: ' ',
        then: [ENTER],
        element: spy => React.createElement(HideStatesEditor, { widget: plainWidget, states: hideStates, onComplete: spy, onCancel: vi.fn() }),
        fired: spy => (spy.mock.calls[0]?.[0] as WidgetItem | undefined)?.metadata !== undefined
    }
];

async function pressShortcut(testCase: ShortcutCase, keys: string, expectFired: boolean): Promise<boolean> {
    const stdin = new MockTtyStream() as unknown as NodeJS.ReadStream;
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const spy = vi.fn();
    const instance = render(testCase.element(spy), { stdin, stdout, stderr, debug: true, exitOnCtrlC: false, patchConsole: false });

    const fired = () => testCase.fired(spy, stripAnsi(stdout.getOutput()));

    try {
        await waitUntil(() => stdout.getOutput().length > 0);
        const inputs = [keys, ...(testCase.then ?? [])];
        for (const [index, input] of inputs.entries()) {
            const drawn = stdout.getOutput().length;
            stdin.write(input);
            // A follow-up key needs the previous key's redraw, or it acts on stale state
            if (index < inputs.length - 1) {
                await waitUntil(() => stdout.getOutput().length > drawn);
            }
        }
        if (expectFired) {
            return await waitUntil(fired);
        }
        await settle();
        return fired();
    } finally {
        instance.unmount();
        instance.cleanup();
        stdin.destroy();
        stdout.destroy();
        stderr.destroy();
    }
}

describe('letter shortcuts ignore ctrl and alt combos', () => {
    describe.each(cases)('$name', (testCase) => {
        it('fires on the bare key', async () => {
            expect(await pressShortcut(testCase, testCase.shortcut, true)).toBe(true);
        });

        it.each(Object.keys(MODIFIED))('does nothing with %s held', async (modifier) => {
            const toBytes = MODIFIED[modifier] ?? ((key: string) => key);
            expect(await pressShortcut(testCase, toBytes(testCase.shortcut), false)).toBe(false);
        });
    });
});
