import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import type { CompactionData } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { ZERO_COMPACTION_STATS } from '../../utils/compaction';
import { CompactionCounterWidget } from '../CompactionCounter';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const ITEM: WidgetItem = { id: 'compaction-counter', type: 'compaction-counter' };

function render(options: {
    isPreview?: boolean;
    compactionData?: Partial<CompactionData> | null;
    item?: WidgetItem;
} = {}) {
    const widget = new CompactionCounterWidget();
    const compactionData = (options.compactionData === null || options.compactionData === undefined)
        ? options.compactionData
        : { ...ZERO_COMPACTION_STATS, ...options.compactionData };
    const context: RenderContext = {
        isPreview: options.isPreview,
        compactionData
    };
    return widget.render(options.item ?? ITEM, context, DEFAULT_SETTINGS);
}

describe('CompactionCounterWidget', () => {
    describe('metadata', () => {
        it('has correct display name', () => {
            expect(new CompactionCounterWidget().getDisplayName()).toBe('Compaction Counter');
        });

        it('has correct category', () => {
            expect(new CompactionCounterWidget().getCategory()).toBe('Context');
        });

        it('does not support raw value', () => {
            expect(new CompactionCounterWidget().supportsRawValue()).toBe(false);
        });

        it('supports colors', () => {
            expect(new CompactionCounterWidget().supportsColors(ITEM)).toBe(true);
        });

        it('has correct default color', () => {
            expect(new CompactionCounterWidget().getDefaultColor()).toBe('yellow');
        });
    });

    describe('render()', () => {
        it('renders compaction count with icon, space, and number by default', () => {
            expect(render({ compactionData: { count: 3 } })).toBe('↻ 3');
        });

        it('renders count of 1', () => {
            expect(render({ compactionData: { count: 1 } })).toBe('↻ 1');
        });

        it('renders alternate configured formats', () => {
            expect(render({
                compactionData: { count: 3 },
                item: { ...ITEM, metadata: { format: 'text-and-number' } }
            })).toBe('Compactions: 3');
            expect(render({
                compactionData: { count: 3 },
                item: { ...ITEM, metadata: { format: 'number' } }
            })).toBe('3');
        });

        it('renders the Nerd Font glyph when enabled', () => {
            expect(render({
                compactionData: { count: 3 },
                item: { ...ITEM, metadata: { nerdFont: 'true' } }
            })).toBe('\uF021 3');
            expect(render({
                compactionData: { count: 3 },
                item: { ...ITEM, metadata: { format: 'icon-number', nerdFont: 'true' } }
            })).toBe('\uF021 3');
        });

        it('treats legacy icon-number metadata as the default format', () => {
            expect(render({
                compactionData: { count: 3 },
                item: { ...ITEM, metadata: { format: 'icon-number' } }
            })).toBe('↻ 3');
        });

        it('does not render the Nerd Font glyph for text-only formats', () => {
            expect(render({
                compactionData: { count: 3 },
                item: { ...ITEM, metadata: { format: 'text-and-number', nerdFont: 'true' } }
            })).toBe('Compactions: 3');
            expect(render({
                compactionData: { count: 3 },
                item: { ...ITEM, metadata: { format: 'number', nerdFont: 'true' } }
            })).toBe('3');
        });

        it('renders count of 0 by default', () => {
            expect(render({ compactionData: { count: 0 } })).toBe('↻ 0');
        });

        it('renders 0 when compactionData is undefined', () => {
            expect(render()).toBe('↻ 0');
        });

        it('renders 0 when compactionData is null', () => {
            expect(render({ compactionData: null })).toBe('↻ 0');
        });

        it('returns null when count is 0 and hide zero is enabled', () => {
            expect(render({
                compactionData: { count: 0 },
                item: { ...ITEM, metadata: { hideZero: 'true' } }
            })).toBeNull();
        });

        it('renders positive counts when hide zero is enabled', () => {
            expect(render({
                compactionData: { count: 3 },
                item: { ...ITEM, metadata: { hideZero: 'true' } }
            })).toBe('↻ 3');
        });

        it('returns sample data in preview mode', () => {
            expect(render({ isPreview: true })).toBe('↻ 2');
        });

        it('returns formatted sample data in preview mode', () => {
            expect(render({
                isPreview: true,
                item: { ...ITEM, metadata: { format: 'text-and-number' } }
            })).toBe('Compactions: 2');
        });

        it('preview mode ignores live compactionData', () => {
            // Verify preview short-circuits before reading compactionData
            expect(render({ isPreview: true, compactionData: { count: 99 } })).toBe('↻ 2');
        });

        it('appends the trigger split when showTriggers is enabled', () => {
            expect(render({
                compactionData: { count: 3, byTrigger: { auto: 2, manual: 1, unknown: 0 } },
                item: { ...ITEM, metadata: { showTriggers: 'true' } }
            })).toBe('↻ 3 (2 auto, 1 manual)');
        });

        it('shows the unknown bucket in the trigger split only when > 0', () => {
            expect(render({
                compactionData: { count: 3, byTrigger: { auto: 2, manual: 0, unknown: 1 } },
                item: { ...ITEM, metadata: { showTriggers: 'true' } }
            })).toBe('↻ 3 (2 auto, 1 unknown)');
        });

        it('renders a manual-only trigger split', () => {
            expect(render({
                compactionData: { count: 2, byTrigger: { auto: 0, manual: 2, unknown: 0 } },
                item: { ...ITEM, metadata: { showTriggers: 'true' } }
            })).toBe('↻ 2 (2 manual)');
        });

        it('shows no suffix when all trigger buckets are zero', () => {
            expect(render({
                compactionData: { count: 0, byTrigger: { auto: 0, manual: 0, unknown: 0 } },
                item: { ...ITEM, metadata: { showTriggers: 'true' } }
            })).toBe('↻ 0');
        });

        it('appends the trigger split to non-default formats too', () => {
            expect(render({
                compactionData: { count: 2, byTrigger: { auto: 1, manual: 1, unknown: 0 } },
                item: { ...ITEM, metadata: { format: 'number', showTriggers: 'true' } }
            })).toBe('2 (1 auto, 1 manual)');
        });

        it('shows the trigger split sample in preview mode', () => {
            expect(render({
                isPreview: true,
                item: { ...ITEM, metadata: { showTriggers: 'true' } }
            })).toBe('↻ 2 (1 auto, 1 manual)');
        });

        it('appends tokens reclaimed when showReclaimed is enabled', () => {
            expect(render({
                compactionData: { count: 3, tokensReclaimed: 887000 },
                item: { ...ITEM, metadata: { showReclaimed: 'true' } }
            })).toBe('↻ 3 ↓887.0k');
        });

        it('renders tokens reclaimed near 1M as 1.0M (respects the formatTokens rounding fix)', () => {
            expect(render({
                compactionData: { count: 2, tokensReclaimed: 999950 },
                item: { ...ITEM, metadata: { showReclaimed: 'true' } }
            })).toBe('↻ 2 ↓1.0M');
        });

        it('omits tokens reclaimed when the amount is 0', () => {
            expect(render({
                compactionData: { count: 2, tokensReclaimed: 0 },
                item: { ...ITEM, metadata: { showReclaimed: 'true' } }
            })).toBe('↻ 2');
        });

        it('appends tokens reclaimed to non-default formats too', () => {
            expect(render({
                compactionData: { count: 3, tokensReclaimed: 887000 },
                item: { ...ITEM, metadata: { format: 'number', showReclaimed: 'true' } }
            })).toBe('3 ↓887.0k');
        });

        it('stacks trigger split and tokens reclaimed', () => {
            expect(render({
                compactionData: { count: 3, byTrigger: { auto: 2, manual: 1, unknown: 0 }, tokensReclaimed: 887000 },
                item: { ...ITEM, metadata: { showTriggers: 'true', showReclaimed: 'true' } }
            })).toBe('↻ 3 (2 auto, 1 manual) ↓887.0k');
        });

        it('shows the tokens-reclaimed sample in preview mode', () => {
            expect(render({
                isPreview: true,
                item: { ...ITEM, metadata: { showReclaimed: 'true' } }
            })).toBe('↻ 2 ↓120.0k');
        });

        it('renders a custom reclaimed glyph from the symbolReclaimed override', () => {
            expect(render({
                compactionData: { count: 2, tokensReclaimed: 887000 },
                item: { ...ITEM, metadata: { showReclaimed: 'true', symbolReclaimed: 'X' } }
            })).toBe('↻ 2 X887.0k');
        });

        it('drops the reclaimed glyph but keeps the space when the override is empty', () => {
            expect(render({
                compactionData: { count: 2, tokensReclaimed: 887000 },
                item: { ...ITEM, metadata: { showReclaimed: 'true', symbolReclaimed: '' } }
            })).toBe('↻ 2 887.0k');
        });
    });

    describe('editor', () => {
        it('uses metric, format, and toggle keybinds in count mode', () => {
            expect(new CompactionCounterWidget().getCustomKeybinds(ITEM)).toEqual([
                { key: 'm', label: '(m)etric', action: 'cycle-metric' },
                { key: 'f', label: '(f)ormat', action: 'cycle-format' },
                { key: 'n', label: '(n)erd font', action: 'toggle-nerd-font' },
                { key: 's', label: '(s)plit by trigger', action: 'toggle-triggers' },
                { key: 't', label: '(t)okens reclaimed', action: 'toggle-reclaimed' },
                { key: 'h', label: '(h)ide when zero', action: 'toggle-hide-zero' },
                { key: 'g', label: '(g)lyph', action: 'edit-symbol-override' }
            ]);
        });

        it('hides the nerd font keybind for non-default formats', () => {
            expect(new CompactionCounterWidget().getCustomKeybinds({
                ...ITEM,
                metadata: { format: 'text-and-number' }
            })).toEqual([
                { key: 'm', label: '(m)etric', action: 'cycle-metric' },
                { key: 'f', label: '(f)ormat', action: 'cycle-format' },
                { key: 's', label: '(s)plit by trigger', action: 'toggle-triggers' },
                { key: 't', label: '(t)okens reclaimed', action: 'toggle-reclaimed' },
                { key: 'h', label: '(h)ide when zero', action: 'toggle-hide-zero' },
                { key: 'g', label: '(g)lyph', action: 'edit-symbol-override' }
            ]);
        });

        it('has correct editor display', () => {
            expect(new CompactionCounterWidget().getEditorDisplay(ITEM)).toEqual({
                displayText: 'Compaction Counter',
                modifierText: '(icon-space-number)'
            });
        });

        it('shows configured format in the editor display', () => {
            expect(new CompactionCounterWidget().getEditorDisplay({
                ...ITEM,
                metadata: { format: 'number' }
            })).toEqual({
                displayText: 'Compaction Counter',
                modifierText: '(number)'
            });
        });

        it('shows nerd font in the editor display when enabled', () => {
            expect(new CompactionCounterWidget().getEditorDisplay({
                ...ITEM,
                metadata: { nerdFont: 'true' }
            })).toEqual({
                displayText: 'Compaction Counter',
                modifierText: '(icon-space-number, nerd font)'
            });
        });

        it('shows hide zero in the editor display when enabled', () => {
            expect(new CompactionCounterWidget().getEditorDisplay({
                ...ITEM,
                metadata: { hideZero: 'true' }
            })).toEqual({
                displayText: 'Compaction Counter',
                modifierText: '(icon-space-number, hide zero)'
            });
        });

        it('ignores stale icon-number format metadata in the editor display', () => {
            expect(new CompactionCounterWidget().getEditorDisplay({
                ...ITEM,
                metadata: { format: 'icon-number', nerdFont: 'true' }
            })).toEqual({
                displayText: 'Compaction Counter',
                modifierText: '(icon-space-number, nerd font)'
            });
        });

        it('cycles icon-space-number -> text-and-number -> number -> icon-space-number', () => {
            const widget = new CompactionCounterWidget();
            const textAndNumber = widget.handleEditorAction('cycle-format', ITEM);
            const number = widget.handleEditorAction('cycle-format', textAndNumber ?? ITEM);
            const iconSpaceNumber = widget.handleEditorAction('cycle-format', number ?? ITEM);

            expect(textAndNumber?.metadata?.format).toBe('text-and-number');
            expect(number?.metadata?.format).toBe('number');
            expect(iconSpaceNumber?.metadata?.format).toBeUndefined();
        });

        it('removes nerd font metadata when cycling away from icon-space-number', () => {
            const widget = new CompactionCounterWidget();
            const base: WidgetItem = { ...ITEM, metadata: { nerdFont: 'true' } };
            const textAndNumber = widget.handleEditorAction('cycle-format', base);

            expect(textAndNumber?.metadata?.format).toBe('text-and-number');
            expect(textAndNumber?.metadata?.nerdFont).toBeUndefined();
        });

        it('toggles nerd font metadata on and off', () => {
            const widget = new CompactionCounterWidget();
            const enabled = widget.handleEditorAction('toggle-nerd-font', ITEM);
            const disabled = widget.handleEditorAction('toggle-nerd-font', enabled ?? ITEM);

            expect(enabled?.metadata?.nerdFont).toBe('true');
            expect(disabled?.metadata?.nerdFont).toBeUndefined();
        });

        it('toggles hide zero metadata on and off', () => {
            const widget = new CompactionCounterWidget();
            const enabled = widget.handleEditorAction('toggle-hide-zero', ITEM);
            const disabled = widget.handleEditorAction('toggle-hide-zero', enabled ?? ITEM);

            expect(enabled?.metadata?.hideZero).toBe('true');
            expect(disabled?.metadata?.hideZero).toBe('false');
        });

        it('does not enable nerd font for non-default formats', () => {
            const widget = new CompactionCounterWidget();
            const enabled = widget.handleEditorAction('toggle-nerd-font', {
                ...ITEM,
                metadata: { format: 'text-and-number' }
            });

            expect(enabled?.metadata?.format).toBe('text-and-number');
            expect(enabled?.metadata?.nerdFont).toBeUndefined();
        });

        it('toggles showTriggers metadata on and off', () => {
            const widget = new CompactionCounterWidget();
            const enabled = widget.handleEditorAction('toggle-triggers', ITEM);
            const disabled = widget.handleEditorAction('toggle-triggers', enabled ?? ITEM);

            expect(enabled?.metadata?.showTriggers).toBe('true');
            expect(disabled?.metadata?.showTriggers).toBe('false');
        });

        it('shows trigger split in the editor display when enabled', () => {
            expect(new CompactionCounterWidget().getEditorDisplay({
                ...ITEM,
                metadata: { showTriggers: 'true' }
            })).toEqual({
                displayText: 'Compaction Counter',
                modifierText: '(icon-space-number, trigger split)'
            });
        });

        it('toggles showReclaimed metadata on and off', () => {
            const widget = new CompactionCounterWidget();
            const enabled = widget.handleEditorAction('toggle-reclaimed', ITEM);
            const disabled = widget.handleEditorAction('toggle-reclaimed', enabled ?? ITEM);

            expect(enabled?.metadata?.showReclaimed).toBe('true');
            expect(disabled?.metadata?.showReclaimed).toBe('false');
        });

        it('shows reclaimed in the editor display when enabled', () => {
            expect(new CompactionCounterWidget().getEditorDisplay({
                ...ITEM,
                metadata: { showReclaimed: 'true' }
            })).toEqual({
                displayText: 'Compaction Counter',
                modifierText: '(icon-space-number, reclaimed)'
            });
        });
    });

    describe('metric selector', () => {
        it('renders only the auto-trigger count when metric is auto', () => {
            expect(render({
                compactionData: { count: 5, byTrigger: { auto: 3, manual: 2, unknown: 0 } },
                item: { ...ITEM, metadata: { metric: 'auto' } }
            })).toBe('3');
        });

        it('renders only the manual-trigger count when metric is manual', () => {
            expect(render({
                compactionData: { count: 5, byTrigger: { auto: 3, manual: 2, unknown: 0 } },
                item: { ...ITEM, metadata: { metric: 'manual' } }
            })).toBe('2');
        });

        it('renders only the unknown-trigger count when metric is unknown', () => {
            expect(render({
                compactionData: { count: 5, byTrigger: { auto: 3, manual: 1, unknown: 1 } },
                item: { ...ITEM, metadata: { metric: 'unknown' } }
            })).toBe('1');
        });

        it('renders the reclaimed tokens formatted when metric is reclaimed', () => {
            expect(render({
                compactionData: { count: 2, tokensReclaimed: 887000 },
                item: { ...ITEM, metadata: { metric: 'reclaimed' } }
            })).toBe('887.0k');
        });

        it('emits a raw value, ignoring format and icon settings', () => {
            expect(render({
                compactionData: { count: 5, byTrigger: { auto: 3, manual: 2, unknown: 0 } },
                item: { ...ITEM, metadata: { metric: 'auto', format: 'icon-space-number', nerdFont: 'true' } }
            })).toBe('3');
        });

        it('hides a zero metric value when hide zero is enabled', () => {
            expect(render({
                compactionData: { count: 4, byTrigger: { auto: 0, manual: 4, unknown: 0 } },
                item: { ...ITEM, metadata: { metric: 'auto', hideZero: 'true' } }
            })).toBeNull();
        });

        it('still shows a zero metric value when hide zero is off', () => {
            expect(render({
                compactionData: { count: 4, byTrigger: { auto: 0, manual: 4, unknown: 0 } },
                item: { ...ITEM, metadata: { metric: 'auto' } }
            })).toBe('0');
        });

        it('shows the sample metric value in preview mode, ignoring hide zero', () => {
            expect(render({
                isPreview: true,
                item: { ...ITEM, metadata: { metric: 'unknown', hideZero: 'true' } }
            })).toBe('0');
            expect(render({
                isPreview: true,
                item: { ...ITEM, metadata: { metric: 'reclaimed' } }
            })).toBe('120.0k');
        });

        it('shows the metric in the editor display', () => {
            expect(new CompactionCounterWidget().getEditorDisplay({
                ...ITEM,
                metadata: { metric: 'reclaimed', hideZero: 'true' }
            })).toEqual({
                displayText: 'Compaction Counter',
                modifierText: '(reclaimed value, hide zero)'
            });
        });

        it('uses only metric and hide-zero keybinds in metric mode', () => {
            expect(new CompactionCounterWidget().getCustomKeybinds({
                ...ITEM,
                metadata: { metric: 'auto' }
            })).toEqual([
                { key: 'm', label: '(m)etric', action: 'cycle-metric' },
                { key: 'h', label: '(h)ide when zero', action: 'toggle-hide-zero' }
            ]);
        });

        it('cycles count -> auto -> manual -> unknown -> reclaimed -> count', () => {
            const widget = new CompactionCounterWidget();
            const auto = widget.handleEditorAction('cycle-metric', ITEM);
            const manual = widget.handleEditorAction('cycle-metric', auto ?? ITEM);
            const unknown = widget.handleEditorAction('cycle-metric', manual ?? ITEM);
            const reclaimed = widget.handleEditorAction('cycle-metric', unknown ?? ITEM);
            const count = widget.handleEditorAction('cycle-metric', reclaimed ?? ITEM);

            expect(auto?.metadata?.metric).toBe('auto');
            expect(manual?.metadata?.metric).toBe('manual');
            expect(unknown?.metadata?.metric).toBe('unknown');
            expect(reclaimed?.metadata?.metric).toBe('reclaimed');
            expect(count?.metadata?.metric).toBeUndefined();
        });
    });
});
