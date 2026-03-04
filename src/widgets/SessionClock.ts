import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

function formatDurationFromMs(durationMs: number): string {
    const totalMinutes = Math.floor(durationMs / (1000 * 60));

    if (totalMinutes < 1) {
        return '<1m';
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
        return `${minutes}m`;
    }
    if (minutes === 0) {
        return `${hours}hr`;
    }

    return `${hours}hr ${minutes}m`;
}

export class SessionClockWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows elapsed time since current session started'; }
    getDisplayName(): string { return 'Session Clock'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '2hr 15m' : 'Session: 2hr 15m';
        }

        const durationMs = context.data?.cost?.total_duration_ms;
        if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) {
            const formatted = formatDurationFromMs(durationMs);
            return item.rawValue ? formatted : `Session: ${formatted}`;
        }

        const duration = context.sessionDuration ?? '0m';
        return item.rawValue ? duration : `Session: ${duration}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}