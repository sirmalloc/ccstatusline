import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
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

        if (context.isPreview) {
            return item.rawValue ? 'kkmpptxz' : ' kkmpptxz';
        }

        if (!isInsideJjRepo(context)) {
            return hideNoJj ? null : ' no jj';
        }

        const changeId = this.getJjRevision(context);
        if (changeId) {
            return item.rawValue ? changeId : ` ${changeId}`;
        }

        return hideNoJj ? null : ' no jj';
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

    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }
}
