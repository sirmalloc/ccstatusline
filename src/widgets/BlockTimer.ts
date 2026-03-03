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
    formatUsageDuration,
    resolveUsageWindowWithFallback
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

function makeTimerProgressBar(percent: number, width: number): string {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const filledWidth = Math.floor((clampedPercent / 100) * width);
    const emptyWidth = width - filledWidth;
    return '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
}

export class BlockTimerWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows current 5hr block elapsed time or progress'; }
    getDisplayName(): string { return 'Block Timer'; }
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
            const previewPercent = inverted ? 26.1 : 73.9;
            const prefix = item.rawValue ? '' : 'Block ';

            if (displayMode === 'progress' || displayMode === 'progress-short') {
                const barWidth = displayMode === 'progress' ? 32 : 16;
                const progressBar = makeTimerProgressBar(previewPercent, barWidth);
                return `${prefix}[${progressBar}] ${previewPercent.toFixed(1)}%`;
            }

            return item.rawValue ? '3hr 45m' : 'Block: 3hr 45m';
        }

        const usageData = fetchUsageData();
        const window = resolveUsageWindowWithFallback(usageData, context.blockMetrics);

        if (!window) {
            if (displayMode === 'progress' || displayMode === 'progress-short') {
                const barWidth = displayMode === 'progress' ? 32 : 16;
                const emptyBar = '░'.repeat(barWidth);
                return item.rawValue ? `[${emptyBar}] 0.0%` : `Block [${emptyBar}] 0.0%`;
            }

            return item.rawValue ? '0hr 0m' : 'Block: 0hr 0m';
        }

        if (displayMode === 'progress' || displayMode === 'progress-short') {
            const barWidth = displayMode === 'progress' ? 32 : 16;
            const percent = inverted ? window.remainingPercent : window.elapsedPercent;
            const progressBar = makeTimerProgressBar(percent, barWidth);
            const percentage = percent.toFixed(1);

            if (item.rawValue) {
                return `[${progressBar}] ${percentage}%`;
            }

            return `Block [${progressBar}] ${percentage}%`;
        }

        const elapsedTime = formatUsageDuration(window.elapsedMs);
        return item.rawValue ? elapsedTime : `Block: ${elapsedTime}`;
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
