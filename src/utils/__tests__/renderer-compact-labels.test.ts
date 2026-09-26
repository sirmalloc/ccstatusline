import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    SettingsSchema,
    SettingsSchema_v1,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { toggleCompactLabel } from '../../widgets/shared/raw-or-labeled';
import { stripSgrCodes } from '../ansi';
import { migrateConfig } from '../migrations';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        colorLevel: 0,
        ...overrides,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(overrides.powerline ?? {})
        }
    };
}

const CONTEXT: RenderContext = { isPreview: false, terminalWidth: 200, data: { model: 'Opus 4.6', cost: { total_cost_usd: 2.456 } } };

function renderLine(widgets: WidgetItem[], settings: Settings): string {
    const preRenderedLines = preRenderAllWidgets([widgets], settings, CONTEXT);
    const maxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
    return stripSgrCodes(renderStatusLine(widgets, settings, CONTEXT, preRenderedLines[0] ?? [], maxWidths));
}

const TRIO: WidgetItem[] = [
    { id: '1', type: 'model' },
    { id: '2', type: 'separator', character: '|' },
    { id: '3', type: 'session-cost' }
];

describe('compact labels rendering', () => {
    it('keeps default labels when the setting is absent (old configs)', () => {
        expect(DEFAULT_SETTINGS.compactLabels).toBe(false);
        expect(renderLine(TRIO, createSettings())).toBe('Model: Opus 4.6 | Cost: $2.46');
    });

    it('shortens mapped labels when compactLabels is on', () => {
        expect(renderLine(TRIO, createSettings({ compactLabels: true }))).toBe('M: Opus 4.6 | $2.46');
    });

    it('lets a per-widget opt-out beat the global setting', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model' },
            { id: '2', type: 'separator', character: '|' },
            { id: '3', type: 'session-cost', metadata: { compactLabel: 'false' } }
        ];
        expect(renderLine(widgets, createSettings({ compactLabels: true }))).toBe('M: Opus 4.6 | Cost: $2.46');
    });

    it('lets a per-widget opt-in work without the global setting', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'model', metadata: { compactLabel: 'true' } },
            { id: '2', type: 'separator', character: '|' },
            { id: '3', type: 'session-cost' }
        ];
        expect(renderLine(widgets, createSettings())).toBe('M: Opus 4.6 | Cost: $2.46');
    });

    it('the per-widget (j) toggle beats the global setting at render time', () => {
        const settings = createSettings({ compactLabels: true });
        // Simulate pressing (j) once on the model widget while the global
        // flag is on: the cycle writes an explicit 'false' and the label
        // renders in its default form.
        const toggled = toggleCompactLabel({ id: '1', type: 'model' }, settings);
        expect(toggled.metadata).toEqual({ compactLabel: 'false' });
        // Model is forced back to its default label while session-cost stays
        // compact through the global flag.
        expect(renderLine([toggled, { id: '2', type: 'separator', character: '|' }, { id: '3', type: 'session-cost' }], settings))
            .toBe('Model: Opus 4.6 | $2.46');
    });

    it('parses legacy settings without the new key to the off default', () => {
        const legacy = SettingsSchema.parse({ version: 4, lines: [[{ id: '1', type: 'model' }]] });
        expect(legacy.compactLabels).toBe(false);
    });

    it('migrates a v1 config and keeps compact labels off', () => {
        const v1 = { lines: [[{ id: '1', type: 'model' }]], globalBold: false };
        const migrated = migrateConfig(v1, 4) as Record<string, unknown>;
        const parsed = SettingsSchema.parse(migrated);
        expect(parsed.version).toBe(4);
        expect(parsed.compactLabels).toBe(false);
    });

    it('keeps legacy v1 schema unaware of the new key', () => {
        expect('compactLabels' in SettingsSchema_v1.shape).toBe(false);
    });
});
