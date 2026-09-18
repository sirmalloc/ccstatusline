import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { renderStatusLine } from '../renderer';

interface PreRenderedWidget {
    content: string;
    plainLength: number;
    widget: WidgetItem;
}

// Truecolor so every expected code is an unambiguous literal rather than a
// palette lookup.
const CONFIGURED = 'hex:0000FF';
const TIER_OK = 'hex:00FF00';
const TIER_WARN = 'hex:FFAA00';
const TIER_CRIT = 'hex:FF0000';

const ANSI_CONFIGURED = '\x1b[38;2;0;0;255m';
const ANSI_OK = '\x1b[38;2;0;255;0m';
const ANSI_WARN = '\x1b[38;2;255;170;0m';
const ANSI_CRIT = '\x1b[38;2;255;0;0m';

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        ...overrides,
        colorLevel: 3,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(overrides.powerline ?? {})
        }
    };
}

function budgetItem(metadata: Record<string, string>): WidgetItem {
    return {
        id: 'usage',
        type: 'extra-usage-used',
        color: CONFIGURED,
        metadata: {
            budgetColorOk: TIER_OK,
            budgetColorWarn: TIER_WARN,
            budgetColorCrit: TIER_CRIT,
            ...metadata
        }
    };
}

function render(
    item: WidgetItem,
    utilization: number | undefined,
    settingsOverrides: Partial<Settings> = {}
): string {
    const settings = createSettings(settingsOverrides);
    const context: RenderContext = {
        isPreview: false,
        terminalWidth: 200,
        usageData: { extraUsageUtilization: utilization }
    };
    const preRendered: PreRenderedWidget[] = [{ content: '$106', plainLength: 4, widget: item }];
    return renderStatusLine([item], settings, context, preRendered, []);
}

const powerline: Partial<Settings> = { powerline: { ...DEFAULT_SETTINGS.powerline, enabled: true } };

describe('renderer resolves a widget dynamic color', () => {
    const cases = [
        {
            name: 'keeps the configured color when budget colors are off',
            metadata: {},
            utilization: 95,
            expected: ANSI_CONFIGURED
        },
        {
            name: 'keeps the configured color when utilization is unknown',
            metadata: { budgetColors: 'true' },
            utilization: undefined,
            expected: ANSI_CONFIGURED
        },
        {
            name: 'uses the ok tier below the warn threshold',
            metadata: { budgetColors: 'true' },
            utilization: 50,
            expected: ANSI_OK
        },
        {
            name: 'uses the warn tier at the warn threshold',
            metadata: { budgetColors: 'true' },
            utilization: 75,
            expected: ANSI_WARN
        },
        {
            name: 'uses the crit tier at the crit threshold',
            metadata: { budgetColors: 'true' },
            utilization: 90,
            expected: ANSI_CRIT
        }
    ] as const;

    const paths: { path: string; settings: Partial<Settings> }[] = [
        { path: 'normal', settings: {} },
        { path: 'powerline', settings: powerline }
    ];

    describe.each(paths)('$path path', ({ settings }) => {
        it.each(cases)('$name', ({ metadata, utilization, expected }) => {
            const out = render(budgetItem(metadata), utilization, settings);

            expect(out).toContain(expected);
            for (const other of [ANSI_CONFIGURED, ANSI_OK, ANSI_WARN, ANSI_CRIT]) {
                if (other !== expected)
                    expect(out).not.toContain(other);
            }
        });

        it('lets the global foreground override win over the dynamic color', () => {
            const out = render(
                budgetItem({ budgetColors: 'true' }),
                95,
                { ...settings, overrideForegroundColor: 'hex:ABCDEF' }
            );

            expect(out).toContain('\x1b[38;2;171;205;239m');
            expect(out).not.toContain(ANSI_CRIT);
        });
    });
});
