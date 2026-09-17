import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getJjChangeCounts,
    isInsideJjRepo
} from '../utils/jj';

import {
    NO_JJ_HIDEABLE_STATE,
    isHidden
} from './shared/hideable';

export class JjInsertionsWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows jujutsu insertions count'; }
    getDisplayName(): string { return 'JJ Insertions'; }
    getCategory(): string { return 'Jujutsu'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_JJ_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoJj = isHidden(item, NO_JJ_HIDEABLE_STATE.key);

        if (context.isPreview) {
            return '+42';
        }

        if (!isInsideJjRepo(context)) {
            return hideNoJj ? null : '(no jj)';
        }

        const changes = getJjChangeCounts(context);
        return `+${changes.insertions}`;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
