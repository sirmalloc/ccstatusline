import { execSync } from 'child_process';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class TaskTimerWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows current task execution time (requires claude-code-task-timer hooks)'; }
    getDisplayName(): string { return 'Task Timer'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '1m 23s' : 'Running: 1m 23s';
        }

        // Get timing hook script path
        const hookPath = this.getTimingHookPath();

        if (!existsSync(hookPath)) {
            return '[Timer: Hook not installed]';
        }

        try {
            const timeout = 2000; // 2 second timeout
            const jsonInput = JSON.stringify(context.data ?? {});

            // Execute the timing hook script
            let output = execSync(`bash "${hookPath}"`, {
                encoding: 'utf8',
                input: jsonInput,
                timeout: timeout,
                stdio: ['pipe', 'pipe', 'ignore'],
                env: process.env
            }).trim();

            // Strip ANSI codes
            output = output.replace(/\x1b\[[0-9;]*m/g, '');

            if (!output) {
                return null;
            }

            // If rawValue is true, strip the prefix (e.g., "Running: " or "Completed: ")
            if (item.rawValue) {
                const match = /[:：]\s*(.+)$/.exec(output);
                if (match?.[1]) {
                    return match[1];
                }
            }

            return output;
        } catch {
            // Silent failure - return null if hook execution fails
            return null;
        }
    }

    /**
     * Get the path to the timing hook script
     */
    private getTimingHookPath(): string {
        const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');
        return path.join(claudeConfigDir, 'hooks', 'timing_hook.sh');
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}