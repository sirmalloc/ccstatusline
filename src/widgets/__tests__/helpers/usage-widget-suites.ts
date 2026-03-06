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
    getCustomKeybinds(): CustomKeybind[];
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
    expectedModifierText: string;
    modifierItem: WidgetItem;
}

const EXPECTED_USAGE_KEYBINDS: CustomKeybind[] = [
    { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
    { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' }
];

const EXPECTED_TIMER_KEYBINDS: CustomKeybind[] = [
    { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
    { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' },
    { key: 's', label: '(s)hort time', action: 'toggle-compact' }
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

    it('exposes progress and invert keybinds', () => {
        const widget = config.createWidget();

        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.getCustomKeybinds()).toEqual(EXPECTED_USAGE_KEYBINDS);
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

    it('toggles invert metadata and shows editor modifiers', () => {
        const widget = config.createWidget();

        const inverted = widget.handleEditorAction('toggle-invert', config.baseItem);
        const cleared = widget.handleEditorAction('toggle-invert', inverted ?? config.baseItem);

        expect(inverted?.metadata?.invert).toBe('true');
        expect(cleared?.metadata?.invert).toBe('false');
        expect(widget.getEditorDisplay(config.baseItem).modifierText).toBeUndefined();
        expect(widget.getEditorDisplay(config.modifierItem).modifierText).toBe(config.expectedModifierText);
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

    it('supports raw value and exposes progress/invert/compact keybinds', () => {
        const widget = config.createWidget();

        expect(widget.getDisplayName()).toBe(config.expectedDisplayName);
        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.getCustomKeybinds()).toEqual(EXPECTED_TIMER_KEYBINDS);
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
}