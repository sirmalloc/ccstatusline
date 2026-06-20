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
    getGitAheadBehind,
    isInsideGitWorkTree
} from '../utils/git';

import {
    NO_GIT_HIDEABLE_STATE,
    NO_UPSTREAM_HIDEABLE_STATE,
    isHidden
} from './shared/hideable';
import {
    getSlotSymbol,
    getSymbolKeybind,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';

const AHEAD_SLOT: SymbolSlot = { id: 'symbolAhead', label: 'Ahead', defaultSymbol: '↑' };
const BEHIND_SLOT: SymbolSlot = { id: 'symbolBehind', label: 'Behind', defaultSymbol: '↓' };

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when not diverged (↑0↓0)', defaultEnabled: true };

export class GitAheadBehindWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows commits ahead/behind upstream (↑2↓3)'; }
    getDisplayName(): string { return 'Git Ahead/Behind'; }
    getCategory(): string { return 'Git'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_GIT_HIDEABLE_STATE, NO_UPSTREAM_HIDEABLE_STATE, ZERO_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const aheadSymbol = getSlotSymbol(item, AHEAD_SLOT);
        const behindSymbol = getSlotSymbol(item, BEHIND_SLOT);

        if (context.isPreview) {
            if (item.rawValue)
                return '2,3';
            return `${aheadSymbol}2${behindSymbol}3`;
        }

        if (!isInsideGitWorkTree(context)) {
            return isHidden(item, NO_GIT_HIDEABLE_STATE.key) ? null : '(no git)';
        }

        const result = getGitAheadBehind(context);
        if (!result) {
            return isHidden(item, NO_UPSTREAM_HIDEABLE_STATE.key) ? null : '(no upstream)';
        }

        if (result.ahead === 0 && result.behind === 0) {
            if (isHidden(item, ZERO_HIDEABLE_STATE.key, ZERO_HIDEABLE_STATE.defaultEnabled)) {
                return null;
            }

            return item.rawValue ? '0,0' : `${aheadSymbol}0${behindSymbol}0`;
        }

        if (item.rawValue) {
            return `${result.ahead},${result.behind}`;
        }

        const parts: string[] = [];
        if (result.ahead > 0)
            parts.push(`${aheadSymbol}${result.ahead}`);
        if (result.behind > 0)
            parts.push(`${behindSymbol}${result.behind}`);

        return parts.join('');
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, [AHEAD_SLOT, BEHIND_SLOT]);
    }

    getNumericValue(context: RenderContext, _item: WidgetItem): number | null {
        if (!isInsideGitWorkTree(context))
            return null;
        const result = getGitAheadBehind(context);
        if (!result)
            return null;
        // Return total divergence (ahead + behind)
        return result.ahead + result.behind;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
