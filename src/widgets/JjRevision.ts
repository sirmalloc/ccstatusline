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
    isInsideJjRepo,
    runJjArgs
} from '../utils/jj';

import {
    NO_JJ_HIDEABLE_STATE,
    isHidden
} from './shared/hideable';
import {
    formatSymbolPrefix,
    getSymbolKeybind,
    renderSymbolOverrideEditor
} from './shared/symbol-override';

const DEFAULT_SYMBOL = '';

export class JjRevisionWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows the current jujutsu change ID (short)'; }
    getDisplayName(): string { return 'JJ Revision'; }
    getCategory(): string { return 'Jujutsu'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_JJ_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoJj = isHidden(item, NO_JJ_HIDEABLE_STATE.key);
        const prefix = formatSymbolPrefix(item, DEFAULT_SYMBOL);

        if (context.isPreview) {
            return item.rawValue ? 'kkmpptxz' : `${prefix}kkmpptxz`;
        }

        if (!isInsideJjRepo(context)) {
            return hideNoJj ? null : `${prefix}no jj`;
        }

        const changeId = this.getJjRevision(context);
        if (changeId) {
            return item.rawValue ? changeId : `${prefix}${changeId}`;
        }

        return hideNoJj ? null : `${prefix}no jj`;
    }

    private getJjRevision(context: RenderContext): string | null {
        return runJjArgs([
            'log',
            '--no-graph',
            '-r',
            '@',
            '-T',
            'change_id.shortest()'
        ], context);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolOverrideEditor(props, DEFAULT_SYMBOL);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }
}
