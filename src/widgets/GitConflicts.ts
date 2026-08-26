import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import {
    getGitConflictCount,
    isInsideGitWorkTree
} from '../utils/git';

import { makeModifierText } from './shared/editor-display';
import {
    getHideNoGitKeybinds,
    getHideNoGitModifierText,
    handleToggleNoGitAction,
    isHideNoGitEnabled
} from './shared/git-no-git';
import { removeMetadataKeys } from './shared/metadata';
import {
    getSlotSymbol,
    getSymbolKeybind,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';

const CONFLICT_SLOT: SymbolSlot = { id: 'character', label: 'Conflicts', defaultSymbol: '⚠' };
const CLEAN_SLOT: SymbolSlot = { id: 'symbolClean', label: 'Clean', defaultSymbol: '✓' };

// How the widget renders with no conflicts. 'count' keeps the warning glyph and
// a 0, 'clean' swaps in the clean glyph, 'hidden' drops the widget entirely.
const ZERO_DISPLAYS = ['count', 'clean', 'hidden'] as const;
type ZeroDisplay = typeof ZERO_DISPLAYS[number];

const DEFAULT_ZERO_DISPLAY: ZeroDisplay = 'count';
const ZERO_DISPLAY_METADATA_KEY = 'zeroDisplay';
const CYCLE_ZERO_DISPLAY_ACTION = 'cycle-zero-display';

function getZeroDisplay(item: WidgetItem): ZeroDisplay {
    const value = item.metadata?.[ZERO_DISPLAY_METADATA_KEY];
    return (ZERO_DISPLAYS as readonly string[]).includes(value ?? '') ? (value as ZeroDisplay) : DEFAULT_ZERO_DISPLAY;
}

// The default is stored as the absence of the key, so untouched items keep no metadata.
function cycleZeroDisplay(item: WidgetItem): WidgetItem {
    const current = getZeroDisplay(item);
    const next = ZERO_DISPLAYS[(ZERO_DISPLAYS.indexOf(current) + 1) % ZERO_DISPLAYS.length] ?? DEFAULT_ZERO_DISPLAY;

    if (next === DEFAULT_ZERO_DISPLAY) {
        return removeMetadataKeys(item, [ZERO_DISPLAY_METADATA_KEY]);
    }

    return {
        ...item,
        metadata: {
            ...item.metadata,
            [ZERO_DISPLAY_METADATA_KEY]: next
        }
    };
}

export class GitConflictsWidget implements Widget {
    getDefaultColor(): string { return 'red'; }
    getDescription(): string { return 'Shows count of merge conflicts'; }
    getDisplayName(): string { return 'Git Conflicts'; }
    getCategory(): string { return 'Git'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers: string[] = [];
        const noGitText = getHideNoGitModifierText(item);
        if (noGitText)
            modifiers.push('hide \'no git\'');

        const zeroDisplay = getZeroDisplay(item);
        if (zeroDisplay === 'clean')
            modifiers.push('clean when zero');
        else if (zeroDisplay === 'hidden')
            modifiers.push('hide when zero');

        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText(modifiers)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_ZERO_DISPLAY_ACTION) {
            return cycleZeroDisplay(item);
        }

        return handleToggleNoGitAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoGit = isHideNoGitEnabled(item);
        const symbol = getSlotSymbol(item, CONFLICT_SLOT);

        if (context.isPreview) {
            if (item.rawValue)
                return '2';
            return `${symbol}2`;
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '(no git)';
        }

        const count = getGitConflictCount(context);

        if (count === 0) {
            const zeroDisplay = getZeroDisplay(item);
            if (zeroDisplay === 'hidden')
                return null;
            if (zeroDisplay === 'clean' && !item.rawValue)
                return getSlotSymbol(item, CLEAN_SLOT);
        }

        if (item.rawValue) {
            return count.toString();
        }

        return `${symbol}${count}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            ...getHideNoGitKeybinds(),
            { key: 'z', label: '(z)ero conflicts display', action: CYCLE_ZERO_DISPLAY_ACTION },
            getSymbolKeybind()
        ];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, [CONFLICT_SLOT, CLEAN_SLOT]);
    }

    getNumericValue(context: RenderContext, _item: WidgetItem): number | null {
        if (!isInsideGitWorkTree(context))
            return null;
        return getGitConflictCount(context);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
