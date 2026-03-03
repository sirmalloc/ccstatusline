import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    fetchUsageData,
    getUsageErrorMessage,
    makeUsageProgressBar
} from '../utils/usage';

type DisplayMode = 'time' | 'progress' | 'progress-short';

function getDisplayMode(item: WidgetItem): DisplayMode {
    const mode = item.metadata?.display;
    if (mode === 'progress' || mode === 'progress-short') {
        return mode;
    }
    return 'time';
}

function isInverted(item: WidgetItem): boolean {
    return item.metadata?.invert === 'true';
}

export class SessionUsageWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows daily/session API usage percentage'; }
    getDisplayName(): string { return 'Session Usage'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const mode = getDisplayMode(item);
        const modifiers: string[] = [];

        if (mode === 'progress') {
            modifiers.push('progress bar');
        } else if (mode === 'progress-short') {
            modifiers.push('short bar');
        }

        if (isInverted(item)) {
            modifiers.push('inverted');
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-progress') {
            const currentMode = getDisplayMode(item);
            let nextMode: DisplayMode;

            if (currentMode === 'time') {
                nextMode = 'progress';
            } else if (currentMode === 'progress') {
                nextMode = 'progress-short';
            } else {
                nextMode = 'time';
            }

            const nextMetadata: Record<string, string> = {
                ...(item.metadata ?? {}),
                display: nextMode
            };

            if (nextMode === 'time') {
                delete nextMetadata.invert;
            }

            return {
                ...item,
                metadata: nextMetadata
            };
        }

        if (action === 'toggle-invert') {
            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    invert: (!isInverted(item)).toString()
                }
            };
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = getDisplayMode(item);
        const inverted = isInverted(item);

        if (context.isPreview) {
            const previewPercent = 20;
            const renderedPercent = inverted ? 100 - previewPercent : previewPercent;

            if (displayMode === 'progress' || displayMode === 'progress-short') {
                const width = displayMode === 'progress' ? 32 : 16;
                const progressDisplay = `${makeUsageProgressBar(renderedPercent, width)} ${renderedPercent.toFixed(1)}%`;
                return item.rawValue ? progressDisplay : `Session: ${progressDisplay}`;
            }

            return item.rawValue ? `${previewPercent.toFixed(1)}%` : `Session: ${previewPercent.toFixed(1)}%`;
        }

        const data = fetchUsageData();
        if (data.error)
            return getUsageErrorMessage(data.error);
        if (data.sessionUsage === undefined)
            return null;

        const percent = Math.max(0, Math.min(100, data.sessionUsage));
        if (displayMode === 'progress' || displayMode === 'progress-short') {
            const width = displayMode === 'progress' ? 32 : 16;
            const renderedPercent = inverted ? 100 - percent : percent;
            const progressDisplay = `${makeUsageProgressBar(renderedPercent, width)} ${renderedPercent.toFixed(1)}%`;
            return item.rawValue ? progressDisplay : `Session: ${progressDisplay}`;
        }

        return item.rawValue ? `${percent.toFixed(1)}%` : `Session: ${percent.toFixed(1)}%`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
