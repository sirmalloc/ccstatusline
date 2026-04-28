import {
    beforeEach,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../../types/RenderContext';
import type {
    CustomKeybind,
    WidgetEditorDisplay,
    WidgetItem
} from '../../../types/Widget';

interface UsageWidgetLike {
    getCustomKeybinds(item?: WidgetItem): CustomKeybind[];
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay;
    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null;
    supportsRawValue(): boolean;
}

interface UsagePercentWidgetSuiteConfig<TWidget extends UsageWidgetLike> {
    baseItem: WidgetItem;
    createWidget: () => TWidget;
    errorMessageMock: { mockReturnValue: (value: string) => void };
    expectedModifierText: string;
    expectedProgress: string;
    expectedRawProgress: string;
    expectedRawTime: string;
    expectedTime: string;
    modifierItem: WidgetItem;
    progressItem: WidgetItem;
    rawProgressItem: WidgetItem;
    rawTimeItem: WidgetItem;
    render: (widget: TWidget, item: WidgetItem, context?: RenderContext) => string | null;
    usageField: 'sessionUsage' | 'weeklyUsage';
    usageValue: number;
}

interface UsageTimerEditorSuiteConfig<TWidget extends UsageWidgetLike & { getDisplayName(): string }> {
    baseItem: WidgetItem;
    createWidget: () => TWidget;
    expectedDisplayName: string;
    expectedProgressKeybinds?: CustomKeybind[];
    supportsDateMode?: boolean;
    expectedModifierText: string;
    modifierItem: WidgetItem;
    expectedTimeKeybinds?: CustomKeybind[];
}

const EXPECTED_USAGE_KEYBINDS: CustomKeybind[] = [
    { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' }
];

const EXPECTED_USAGE_PROGRESS_KEYBINDS: CustomKeybind[] = [
    { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
    { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' },
    { key: 't', label: '(t)ime cursor', action: 'toggle-cursor' }
];

const EXPECTED_TIMER_TIME_KEYBINDS: CustomKeybind[] = [
    { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
    { key: 's', label: '(s)hort time', action: 'toggle-compact' }
];

const EXPECTED_TIMER_PROGRESS_KEYBINDS: CustomKeybind[] = [
    { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
    { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' }
];

function getUsageContext(field: 'sessionUsage' | 'weeklyUsage', value: number): RenderContext {
    return field === 'sessionUsage'
        ? { usageData: { sessionUsage: value } }
        : { usageData: { weeklyUsage: value } };
}

export function runUsagePercentWidgetSuite<TWidget extends UsageWidgetLike>(config: UsagePercentWidgetSuiteConfig<TWidget>): void {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exposes widget-managed keybinds for time and bar modes', () => {
        const widget = config.createWidget();

        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.getCustomKeybinds(config.baseItem)).toEqual(EXPECTED_USAGE_KEYBINDS);
        expect(widget.getCustomKeybinds(config.progressItem)).toEqual(EXPECTED_USAGE_PROGRESS_KEYBINDS);
        expect(widget.getCustomKeybinds({
            ...config.baseItem,
            metadata: { display: 'slider' }
        })).toEqual(EXPECTED_USAGE_PROGRESS_KEYBINDS);
        expect(widget.getCustomKeybinds({
            ...config.baseItem,
            metadata: { display: 'slider-only' }
        })).toEqual(EXPECTED_USAGE_PROGRESS_KEYBINDS);
    });

    it.each([
        {
            expected: config.expectedTime,
            item: config.baseItem,
            name: 'renders percentage text in time mode'
        },
        {
            expected: config.expectedProgress,
            item: config.progressItem,
            name: 'renders progress mode'
        },
        {
            expected: config.expectedRawTime,
            item: config.rawTimeItem,
            name: 'renders raw text mode without label'
        },
        {
            expected: config.expectedRawProgress,
            item: config.rawProgressItem,
            name: 'renders raw progress mode without label'
        }
    ])('$name', ({ expected, item }) => {
        const widget = config.createWidget();
        const context = getUsageContext(config.usageField, config.usageValue);

        expect(config.render(widget, item, context)).toBe(expected);
    });

    it('shows usage error text when API call fails', () => {
        const widget = config.createWidget();

        config.errorMessageMock.mockReturnValue('[Timeout]');
        expect(config.render(widget, config.baseItem, { usageData: { error: 'timeout' } })).toBe('[Timeout]');
    });

    it('clears invert and cursor metadata when cycling back to time mode', () => {
        const widget = config.createWidget();
        const updated = widget.handleEditorAction('toggle-progress', {
            ...config.baseItem,
            metadata: {
                display: 'slider-only',
                invert: 'true',
                cursor: 'true'
            }
        });

        expect(updated?.metadata?.display).toBe('time');
        expect(updated?.metadata?.invert).toBeUndefined();
        expect(updated?.metadata?.cursor).toBeUndefined();
    });

    it('cycles display modes in the expected order', () => {
        const widget = config.createWidget();

        const first = widget.handleEditorAction('toggle-progress', config.baseItem);
        const second = widget.handleEditorAction('toggle-progress', first ?? config.baseItem);
        const third = widget.handleEditorAction('toggle-progress', second ?? config.baseItem);
        const fourth = widget.handleEditorAction('toggle-progress', third ?? config.baseItem);
        const fifth = widget.handleEditorAction('toggle-progress', fourth ?? config.baseItem);

        expect(first?.metadata?.display).toBe('progress');
        expect(second?.metadata?.display).toBe('progress-short');
        expect(third?.metadata?.display).toBe('slider');
        expect(fourth?.metadata?.display).toBe('slider-only');
        expect(fifth?.metadata?.display).toBe('time');
    });

    it('toggles invert metadata and shows editor modifiers', () => {
        const widget = config.createWidget();

        const inverted = widget.handleEditorAction('toggle-invert', config.baseItem);
        const cleared = widget.handleEditorAction('toggle-invert', inverted ?? config.baseItem);

        expect(inverted?.metadata?.invert).toBe('true');
        expect(cleared?.metadata?.invert).toBe('false');
        expect(widget.getEditorDisplay(config.baseItem).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay(config.modifierItem).modifierText).toBe(config.expectedModifierText);
    });

    it('shows time cursor editor modifiers in short bar modes', () => {
        const widget = config.createWidget();

        expect(widget.getEditorDisplay({
            ...config.baseItem,
            metadata: {
                cursor: 'true',
                display: 'slider'
            }
        }).modifierText).toBe('(short bar, time cursor)');
        expect(widget.getEditorDisplay({
            ...config.baseItem,
            metadata: {
                cursor: 'true',
                display: 'slider-only'
            }
        }).modifierText).toBe('(short bar only, time cursor)');
    });

    it('ignores stale compact metadata in editor modifiers', () => {
        const widget = config.createWidget();
        const modifierItemWithCompact: WidgetItem = {
            ...config.modifierItem,
            metadata: {
                ...(config.modifierItem.metadata ?? {}),
                compact: 'true'
            }
        };

        expect(widget.getEditorDisplay({
            ...config.baseItem,
            metadata: { compact: 'true' }
        }).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay(modifierItemWithCompact).modifierText).toBe(config.expectedModifierText);
    });
}

export function runUsageTimerEditorSuite<TWidget extends UsageWidgetLike & { getDisplayName(): string }>(config: UsageTimerEditorSuiteConfig<TWidget>): void {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('supports raw value and exposes widget-managed keybinds for time and progress modes', () => {
        const widget = config.createWidget();

        expect(widget.getDisplayName()).toBe(config.expectedDisplayName);
        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.getCustomKeybinds(config.baseItem)).toEqual(config.expectedTimeKeybinds ?? EXPECTED_TIMER_TIME_KEYBINDS);
        expect(widget.getCustomKeybinds(config.modifierItem)).toEqual(config.expectedProgressKeybinds ?? EXPECTED_TIMER_PROGRESS_KEYBINDS);
    });

    it('clears invert metadata when cycling back to time mode', () => {
        const widget = config.createWidget();
        const updated = widget.handleEditorAction('toggle-progress', {
            ...config.baseItem,
            metadata: {
                display: 'progress-short',
                invert: 'true'
            }
        });

        expect(updated?.metadata?.display).toBe('time');
        expect(updated?.metadata?.invert).toBeUndefined();
    });

    it('cycles display modes in the expected order', () => {
        const widget = config.createWidget();

        const first = widget.handleEditorAction('toggle-progress', config.baseItem);
        const second = widget.handleEditorAction('toggle-progress', first ?? config.baseItem);
        const third = widget.handleEditorAction('toggle-progress', second ?? config.baseItem);

        expect(first?.metadata?.display).toBe('progress');
        expect(second?.metadata?.display).toBe('progress-short');
        expect(third?.metadata?.display).toBe('time');
    });

    it('clears compact metadata when cycling into progress mode', () => {
        const widget = config.createWidget();
        const updated = widget.handleEditorAction('toggle-progress', {
            ...config.baseItem,
            metadata: { compact: 'true' }
        });

        expect(updated?.metadata?.display).toBe('progress');
        expect(updated?.metadata?.compact).toBeUndefined();
    });

    it('toggles invert metadata and shows editor modifiers', () => {
        const widget = config.createWidget();

        const inverted = widget.handleEditorAction('toggle-invert', config.baseItem);
        const cleared = widget.handleEditorAction('toggle-invert', inverted ?? config.baseItem);

        expect(inverted?.metadata?.invert).toBe('true');
        expect(cleared?.metadata?.invert).toBe('false');
        expect(widget.getEditorDisplay(config.baseItem).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay(config.modifierItem).modifierText).toBe(config.expectedModifierText);
    });

    it('toggles compact metadata and shows compact modifier text', () => {
        const widget = config.createWidget();

        const compact = widget.handleEditorAction('toggle-compact', config.baseItem);
        const cleared = widget.handleEditorAction('toggle-compact', compact ?? config.baseItem);

        expect(compact?.metadata?.compact).toBe('true');
        expect(cleared?.metadata?.compact).toBe('false');
        expect(widget.getEditorDisplay({ ...config.baseItem, metadata: { compact: 'true' } }).modifierText).toBe('(compact)');
    });
    if (config.supportsDateMode) {
        it('toggles date metadata and shows date modifier text', () => {
            const widget = config.createWidget();

            const dated = widget.handleEditorAction('toggle-date', config.baseItem);
            const cleared = widget.handleEditorAction('toggle-date', dated ?? config.baseItem);

            expect(dated?.metadata?.absolute).toBe('true');
            expect(cleared?.metadata?.absolute).toBe('false');
            expect(widget.getEditorDisplay({ ...config.baseItem, metadata: { absolute: 'true' } }).modifierText).toBe('(date)');
        });
    }
}
