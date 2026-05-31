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
import { CompactionCounterWidget } from '../CompactionCounter';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const ITEM: WidgetItem = { id: 'compaction-counter', type: 'compaction-counter' };

function render(options: {
    isPreview?: boolean;
    compactionData?: CompactionData | null;
    item?: WidgetItem;
} = {}) {
    const widget = new CompactionCounterWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        compactionData: options.compactionData
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
    });

    describe('editor', () => {
        it('uses f and n as keybinds for the default format', () => {
            expect(new CompactionCounterWidget().getCustomKeybinds(ITEM)).toEqual([
                { key: 'f', label: '(f)ormat', action: 'cycle-format' },
                { key: 'n', label: '(n)erd font', action: 'toggle-nerd-font' },
                { key: 'h', label: '(h)ide when zero', action: 'toggle-hide-zero' }
            ]);
        });

        it('hides the nerd font keybind for non-default formats', () => {
            expect(new CompactionCounterWidget().getCustomKeybinds({
                ...ITEM,
                metadata: { format: 'text-and-number' }
            })).toEqual([
                { key: 'f', label: '(f)ormat', action: 'cycle-format' },
                { key: 'h', label: '(h)ide when zero', action: 'toggle-hide-zero' }
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
    });
});
