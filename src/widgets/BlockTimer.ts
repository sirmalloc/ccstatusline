import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

type DisplayMode = 'time' | 'progress' | 'progress-short';

export class BlockTimerWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows elapsed time since beginning of current 5hr block'; }
    getDisplayName(): string { return 'Block Timer'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const mode = item.metadata?.display ?? 'time';
        const modifiers: string[] = [];

        if (mode === 'progress') {
            modifiers.push('progress bar');
        } else if (mode === 'progress-short') {
            modifiers.push('short bar');
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-progress') {
            const currentMode = (item.metadata?.display ?? 'time') as DisplayMode;
            let nextMode: DisplayMode;

            if (currentMode === 'time') {
                nextMode = 'progress';
            } else if (currentMode === 'progress') {
                nextMode = 'progress-short';
            } else {
                nextMode = 'time';
            }

            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    display: nextMode
                }
            };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = (item.metadata?.display ?? 'time') as DisplayMode;

        if (context.isPreview) {
            const prefix = item.rawValue ? '' : 'Block ';
            if (displayMode === 'progress') {
                return `${prefix}[██████████████████████░░░░░░░░] 73.9%`;
            } else if (displayMode === 'progress-short') {
                return `${prefix}[███████░░░░░░░░] 73.9%`;
            }
            return item.rawValue ? '3hr 45m' : 'Block: 3hr 45m';
        }

        // Check if we have block metrics in context
        const blockMetrics = context.blockMetrics;
        if (!blockMetrics) {
            // No active session - show empty progress bar or 0hr 0m
            if (displayMode === 'progress' || displayMode === 'progress-short') {
                const barWidth = displayMode === 'progress' ? 32 : 16;
                const emptyBar = '░'.repeat(barWidth);
                return item.rawValue ? `[${emptyBar}] 0%` : `Block [${emptyBar}] 0%`;
            } else {
                return item.rawValue ? '0hr 0m' : 'Block: 0hr 0m';
            }
        }

        try {
            // Calculate elapsed time and progress
            const now = new Date();
            const elapsedMs = now.getTime() - blockMetrics.startTime.getTime();
            const sessionDurationMs = 5 * 60 * 60 * 1000; // 5 hours
            const progress = Math.min(elapsedMs / sessionDurationMs, 1.0);
            const percentage = (progress * 100).toFixed(1);

            if (displayMode === 'progress' || displayMode === 'progress-short') {
                const barWidth = displayMode === 'progress' ? 32 : 16;
                const filledWidth = Math.floor(progress * barWidth);
                const emptyWidth = barWidth - filledWidth;
                const progressBar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);

                if (item.rawValue) {
                    return `[${progressBar}] ${percentage}%`;
                } else {
                    return `Block [${progressBar}] ${percentage}%`;
                }
            } else {
                // Time display mode
                const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60));
                const elapsedMinutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));

                let timeString: string;
                if (elapsedMinutes === 0) {
                    timeString = `${elapsedHours}hr`;
                } else {
                    timeString = `${elapsedHours}hr ${elapsedMinutes}m`;
                }

                return item.rawValue ? timeString : `Block: ${timeString}`;
            }
        } catch {
            return null;
        }
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}