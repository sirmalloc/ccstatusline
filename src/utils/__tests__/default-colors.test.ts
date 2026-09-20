import chalk from 'chalk';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    COLOR_MAP,
    updateColorMap
} from '../colors';
import { renderStatusLine } from '../renderer';
import { WIDGET_MANIFEST } from '../widget-manifest';

const BRIGHT_BLACK_FG = '\x1b[90m';

describe('default colors resolve through COLOR_MAP', () => {
    it('every widget default color is a COLOR_MAP name', () => {
        const known = new Set(COLOR_MAP.map(entry => entry.name));
        for (const entry of WIDGET_MANIFEST) {
            const color = entry.create().getDefaultColor();
            expect(known.has(color), `${entry.type} -> '${color}'`).toBe(true);
        }
    });
});

describe('uncolored separator default', () => {
    const previousLevel = chalk.level;

    beforeAll(() => {
        chalk.level = 1;
        updateColorMap();
    });

    afterAll(() => {
        chalk.level = previousLevel;
        updateColorMap();
    });

    it('paints a separator with no explicit color as bright black', () => {
        const widgets: WidgetItem[] = [
            { id: 'a', type: 'custom-text' },
            { id: 'sep', type: 'separator' },
            { id: 'b', type: 'custom-text' }
        ];
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 1,
            inheritSeparatorColors: false
        };
        const preRendered = widgets.map(widget => ({
            content: widget.type === 'separator' ? '' : widget.id.toUpperCase(),
            plainLength: widget.type === 'separator' ? 0 : 1,
            widget
        }));

        const out = renderStatusLine(widgets, settings, { isPreview: false, terminalWidth: 200 }, preRendered, []);

        expect(out).toContain(`${BRIGHT_BLACK_FG} | `);
    });
});
