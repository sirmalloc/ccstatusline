import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getTranscriptSessionName } from '../utils/jsonl-session';

export class SessionNameWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows the session name set via /rename command in Claude Code'; }
    getDisplayName(): string { return 'Session Name'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
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

        return item.rawValue ? sessionName : `Session: ${sessionName}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
