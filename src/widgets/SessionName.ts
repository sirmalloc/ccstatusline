import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { getTranscriptSessionName } from '../utils/jsonl-session';

import {
    MAX_WIDTH_ACTION,
    applyMaxWidth,
    getMaxWidthKeybind,
    getMaxWidthModifier,
    renderMaxWidthEditor
} from './shared/max-width';

export class SessionNameWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows the session name set via /rename command in Claude Code'; }
    getDisplayName(): string { return 'Session Name'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const maxWidthText = getMaxWidthModifier(item);
        return {
            displayText: this.getDisplayName(),
            modifierText: maxWidthText ?? undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'my-session' : 'Session: my-session';
        }

        const sessionName = context.transcriptSessionName === undefined
            ? getTranscriptSessionName(context.data?.transcript_path)
            : context.transcriptSessionName;
        if (sessionName === null) {
            return null;
        }

        return applyMaxWidth(item.rawValue ? sessionName : `Session: ${sessionName}`, item.maxWidth);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getMaxWidthKeybind()];
    }

    renderEditor(props: WidgetEditorProps) {
        if (props.action === MAX_WIDTH_ACTION) {
            return renderMaxWidthEditor(props);
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
