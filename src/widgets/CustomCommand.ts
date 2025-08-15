import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetItem
} from '../types/Widget';

export class CustomCommandWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDisplayName(): string { return 'Custom Command'; }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.commandPath ? `[cmd: ${item.commandPath.substring(0, 20)}${item.commandPath.length > 20 ? '...' : ''}]` : '[No command]';
        } else if (item.commandPath && context.data) {
            try {
                const timeout = item.timeout ?? 1000;
                const command = `timeout ${timeout / 1000} ${item.commandPath}`;
                let output = execSync(command, {
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'ignore'],
                    env: {
                        ...process.env,
                        CLAUDE_SESSION_ID: context.data.session_id,
                        CLAUDE_TRANSCRIPT_PATH: context.data.transcript_path,
                        CLAUDE_MODEL_ID: context.data.model.id,
                        CLAUDE_MODEL_NAME: context.data.model.display_name,
                        CLAUDE_CWD: context.data.cwd,
                        CLAUDE_WORKSPACE_DIR: context.data.workspace.current_dir,
                        CLAUDE_PROJECT_DIR: context.data.workspace.project_dir
                    }
                }).trim();

                if (item.maxWidth && output.length > item.maxWidth) {
                    output = output.substring(0, item.maxWidth - 3) + '...';
                }

                return output || null;
            } catch {
                return '[Error]';
            }
        }
        return null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'e', label: '(e)dit cmd', action: 'edit-command' },
            { key: 'w', label: '(w)idth', action: 'edit-width' },
            { key: 't', label: '(t)imeout', action: 'edit-timeout' },
            { key: 'p', label: '(p)reserve colors', action: 'toggle-preserve' }
        ];
    }

    renderEditor(): null {
        // For brevity, return null here. In actual implementation, would return
        // appropriate editor based on which action was triggered
        return null;
    }

    supportsRawValue(): boolean { return false; }
}