import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import {
    getGitConflictCount,
    isInsideGitWorkTree
} from '../utils/git';

import {
    NO_GIT_HIDEABLE_STATE,
    isHidden
} from './shared/hideable';
import { removeMetadataKeys } from './shared/metadata';
import {
    getSlotSymbol,
    getSymbolKeybind,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when there are no conflicts' };
const CONFLICT_SLOT: SymbolSlot = { id: 'character', label: 'Conflicts', defaultSymbol: '⚠' };
const CLEAN_SLOT: SymbolSlot = { id: 'symbolClean', label: 'Clean', defaultSymbol: '✓' };

// Hiding the zero state is handled by the shared hideable-state system. This
// setting only controls how a visible conflict-free tree is represented.
const ZERO_DISPLAYS = ['count', 'clean'] as const;
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
        return {
            displayText: this.getDisplayName(),
            modifierText: getZeroDisplay(item) === 'clean' ? '(clean when zero)' : undefined
        };
    }

    getHideableStates(): HideableState[] {
        return [NO_GIT_HIDEABLE_STATE, ZERO_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_ZERO_DISPLAY_ACTION) {
            return cycleZeroDisplay(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoGit = isHidden(item, NO_GIT_HIDEABLE_STATE.key);
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
            if (isHidden(item, ZERO_HIDEABLE_STATE.key))
                return null;
            if (getZeroDisplay(item) === 'clean' && !item.rawValue)
                return getSlotSymbol(item, CLEAN_SLOT);
        }

        if (item.rawValue) {
            return count.toString();
        }

        return `${symbol}${count}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
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
