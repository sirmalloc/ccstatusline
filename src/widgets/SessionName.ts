import * as fs from 'fs';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

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

        const transcriptPath = context.data?.transcript_path;
        if (!transcriptPath) {
            return null;
        }

        try {
            const content = fs.readFileSync(transcriptPath, 'utf-8');
            const lines = content.split('\n');

            // Find the most recent custom-title entry (search from end)
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i]?.trim();
                if (!line)
                    continue;

                try {
                    const entry = JSON.parse(line) as { type?: string; customTitle?: string };
                    if (entry.type === 'custom-title' && entry.customTitle) {
                        return item.rawValue ? entry.customTitle : `Session: ${entry.customTitle}`;
                    }
                } catch {
                    // Skip malformed lines
                }
            }
        } catch {
            // File not readable
        }

        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}