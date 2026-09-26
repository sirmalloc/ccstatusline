import React from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { getVisibleText } from '../utils/ansi';
import { runCustomCommand } from '../utils/custom-command';

import { lazyEditor } from './shared/lazy-editor';

export class CustomCommandWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Executes a custom shell command and displays output'; }
    getDisplayName(): string { return 'Custom Command'; }
    getCategory(): string { return 'Custom'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const cmd = item.commandPath ?? 'No command';
        const truncatedCmd = cmd.length > 20 ? `${cmd.substring(0, 17)}...` : cmd;
        const displayText = `${this.getDisplayName()} (${truncatedCmd})`;

        // Build modifiers string
        const modifiers: string[] = [];
        if (item.maxWidth) {
            modifiers.push(`max:${item.maxWidth}`);
        }
        if (item.timeout && item.timeout !== 1000) {
            modifiers.push(`timeout:${item.timeout}ms`);
        }
        if (item.preserveColors) {
            modifiers.push('preserve');
        }

        return {
            displayText,
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-preserve') {
            return { ...item, preserveColors: !item.preserveColors };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.commandPath ? `[cmd: ${item.commandPath.substring(0, 20)}${item.commandPath.length > 20 ? '...' : ''}]` : '[No command]';
        } else if (item.commandPath && context.data) {
            const jsonInput = JSON.stringify(
                typeof context.terminalWidth === 'number'
                    ? { ...context.data, terminal_width: context.terminalWidth }
                    : context.data
            );
            const result = runCustomCommand({
                command: item.commandPath,
                input: jsonInput,
                timeoutMs: item.timeout ?? 1000,
                ttlSeconds: context.customCommandCacheTtlSeconds,
                sessionId: context.data.session_id,
                terminalWidth: context.terminalWidth
            });

            if (result.status === 'failed') {
                return result.marker;
            }

            let output = result.stdout;

            // Strip ANSI codes if preserveColors is false
            if (!item.preserveColors) {
                // Strip ANSI/OSC escape sequences and keep only visible text
                output = getVisibleText(output);
            }

            if (item.maxWidth && output.length > item.maxWidth) {
                output = output.substring(0, item.maxWidth - 3) + '...';
            }

            return output || null;
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

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <CustomCommandEditor {...props} />;
    }

    preservesRenderedColors(item: WidgetItem): boolean {
        return item.preserveColors === true;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean {
        // Only supports colors if preserveColors is false
        return !item.preserveColors;
    }
}

const CustomCommandEditor = lazyEditor(() => import('./editors/CustomCommandEditor'));
