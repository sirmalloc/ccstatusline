import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { CustomCommandWidget } from '../CustomCommand';

// Mock the process boundary: echo back whatever is piped to stdin, the way
// `cat` would. The widget output then IS the JSON it sent, so we can assert
// exactly what the custom command received — without spawning a subprocess.
vi.mock('child_process', () => ({ execSync: vi.fn((_command: string, options?: { input?: string }) => options?.input ?? '') }));

describe('CustomCommandWidget', () => {
    const widget = new CustomCommandWidget();

    const defaultSettings: Settings = {
        version: 3,
        lines: [],
        flexMode: 'full',
        compactThreshold: 60,
        colorLevel: 2,
        defaultPadding: ' ',
        inheritSeparatorColors: false,
        globalBold: false,
        gitCacheTtlSeconds: 5,
        minimalistMode: false,
        powerline: {
            enabled: false,
            separators: [],
            separatorInvertBackground: [],
            startCaps: [],
            endCaps: [],
            autoAlign: false,
            continueThemeAcrossLines: false
        }
    };

    const createItem = (): WidgetItem => ({
        id: 'test',
        type: 'custom-command',
        commandPath: 'echo'
    });

    const createContext = (terminalWidth: number | null | undefined): RenderContext => ({
        data: { model: { display_name: 'Sonnet' } },
        terminalWidth,
        isPreview: false
    });

    const renderParsed = (terminalWidth: number | null | undefined): Record<string, unknown> => {
        const output = widget.render(createItem(), createContext(terminalWidth), defaultSettings);
        if (output === null)
            throw new Error('expected command output');
        return JSON.parse(output) as Record<string, unknown>;
    };

    it('includes terminal_width in the JSON piped to the command', () => {
        expect(renderParsed(142).terminal_width).toBe(142);
    });

    it('still passes through the existing data fields', () => {
        const model = renderParsed(142).model as { display_name?: string } | undefined;
        expect(model?.display_name).toBe('Sonnet');
    });

    it('omits terminal_width when the width is unknown', () => {
        expect(renderParsed(null)).not.toHaveProperty('terminal_width');
    });
});
