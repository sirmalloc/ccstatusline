import * as fs from 'fs';
import * as path from 'path';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

interface SessionIndexEntry {
    sessionId: string;
    customTitle?: string;
    summary?: string;
    firstPrompt?: string;
}

interface SessionsIndex {
    version: number;
    entries: SessionIndexEntry[];
    originalPath: string;
}

/**
 * Reads the sessions-index.json file from the same directory as the transcript file
 * and finds the customTitle for the given session ID.
 */
function getSessionName(transcriptPath: string | undefined, sessionId: string | undefined): string | null {
    if (!transcriptPath || !sessionId) {
        return null;
    }

    try {
        const transcriptDir = path.dirname(transcriptPath);
        const indexPath = path.join(transcriptDir, 'sessions-index.json');

        if (!fs.existsSync(indexPath)) {
            return null;
        }

        const content = fs.readFileSync(indexPath, 'utf-8');
        const index = JSON.parse(content) as SessionsIndex;

        const entry = index.entries.find(e => e.sessionId === sessionId);
        if (entry?.customTitle) {
            return entry.customTitle;
        }

        return null;
    } catch {
        return null;
    }
}

export class SessionNameWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the custom session name (set via /name command in Claude Code)'; }
    getDisplayName(): string { return 'Session Name'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'my-session' : 'Session: my-session';
        }

        const sessionName = getSessionName(context.data?.transcript_path, context.data?.session_id);

        if (!sessionName) {
            return null;
        }

        return item.rawValue ? sessionName : `Session: ${sessionName}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}