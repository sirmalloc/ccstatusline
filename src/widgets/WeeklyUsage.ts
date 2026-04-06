import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getDetailLevel } from '../utils/detail-level';
import {
    formatUsageDuration,
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

export class WeeklyUsageWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows weekly API usage percentage'; }
    getDisplayName(): string { return 'Weekly Usage'; }
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
            const previewPercent = 12;
            const renderedPercent = inverted ? 100 - previewPercent : previewPercent;

            if (displayMode === 'progress' || displayMode === 'progress-short') {
                const width = displayMode === 'progress' ? 32 : 16;
                const progressDisplay = `${makeUsageProgressBar(renderedPercent, width)} ${renderedPercent.toFixed(1)}%`;
                return item.rawValue ? progressDisplay : `Weekly: ${progressDisplay}`;
            }

            return item.rawValue ? `${previewPercent.toFixed(1)}%` : `Weekly: ${previewPercent.toFixed(1)}%`;
        }

        const data = context.usageData ?? {};

        // Try API data first, fall back to stdin rate_limits for percentage
        let percent: number | undefined;

        if (data.error || data.weeklyUsage === undefined) {
            const stdinPercent = context.data?.rate_limits?.seven_day?.used_percentage;
            if (stdinPercent !== null && stdinPercent !== undefined) {
                percent = Math.max(0, Math.min(100, stdinPercent));
            } else {
                if (data.error)
                    return getUsageErrorMessage(data.error);
                return null;
            }
        } else {
            percent = Math.max(0, Math.min(100, data.weeklyUsage));
        }

        // Always check stdin for reset timer
        let resetSuffix = '';
        const resetsAt = context.data?.rate_limits?.seven_day?.resets_at;
        if (resetsAt !== null && resetsAt !== undefined) {
            const remainingMs = resetsAt * 1000 - Date.now();
            if (remainingMs > 0) {
                resetSuffix = ` (resets ${formatUsageDuration(remainingMs)})`;
            }
        }

        if (displayMode === 'progress' || displayMode === 'progress-short') {
            const renderedPercent = inverted ? 100 - percent : percent;
            const detail = getDetailLevel(context.terminalWidth);

            if (detail === 'narrow') {
                const text = `${Math.round(renderedPercent)}%`;
                return item.rawValue ? text : text;
            }

            if (detail === 'medium') {
                const compactReset = resetSuffix.replace(/\s*\(resets\s+/, ' (').replace(/hr /g, 'h').replace(/(\d+)m/, '$1m');
                const progressDisplay = `${makeUsageProgressBar(renderedPercent, 8)} ${Math.round(renderedPercent)}%${compactReset}`;
                return item.rawValue ? progressDisplay : progressDisplay;
            }

            const width = displayMode === 'progress' ? 32 : 16;
            const progressDisplay = `${makeUsageProgressBar(renderedPercent, width)} ${renderedPercent.toFixed(1)}%${resetSuffix}`;
            return item.rawValue ? progressDisplay : `Weekly: ${progressDisplay}`;
        }

        return item.rawValue ? `${percent.toFixed(1)}%${resetSuffix}` : `Weekly: ${percent.toFixed(1)}%${resetSuffix}`;
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