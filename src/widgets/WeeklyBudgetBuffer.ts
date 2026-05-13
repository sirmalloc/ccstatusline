import { getColorLevelString } from '../types/ColorLevel';
import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getColorAnsiCode } from '../utils/colors';
import {
    getUsageErrorMessage,
    resolveWeeklyUsageWindow
} from '../utils/usage';
import { SEVEN_DAY_WINDOW_MS } from '../utils/usage-types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = SEVEN_DAY_WINDOW_MS / ONE_DAY_MS;
const BAR_HALF_WIDTH = 10;
const POSITIVE_COLOR_DEFAULT = 'green';
const NEGATIVE_COLOR_DEFAULT = 'red';
const FG_RESET = '\x1b[39m';

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function formatSignedPercent(value: number): string {
    const rounded = Math.round(value);
    return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

function getPositiveColor(item: WidgetItem): string {
    const value = item.metadata?.positiveColor;
    return typeof value === 'string' && value.length > 0 ? value : POSITIVE_COLOR_DEFAULT;
}

function getNegativeColor(item: WidgetItem): string {
    const value = item.metadata?.negativeColor;
    return typeof value === 'string' && value.length > 0 ? value : NEGATIVE_COLOR_DEFAULT;
}

export function computeBudgetBufferPercent(weeklyUsagePercent: number, elapsedPercent: number): number {
    return (elapsedPercent - weeklyUsagePercent) * WINDOW_DAYS;
}

export function renderBipolarBar(
    bufferPercent: number,
    positiveAnsi: string,
    negativeAnsi: string
): string {
    const clamped = clamp(bufferPercent, -100, 100);
    const cells = Math.round((Math.abs(clamped) / 100) * BAR_HALF_WIDTH);

    if (clamped < 0 && cells > 0) {
        const emptyLeft = '░'.repeat(BAR_HALF_WIDTH - cells);
        const fillLeft = '▓'.repeat(cells);
        const ansi = negativeAnsi;
        const reset = ansi ? FG_RESET : '';
        return `${emptyLeft}${ansi}${fillLeft}${reset}│${'░'.repeat(BAR_HALF_WIDTH)}`;
    }

    if (clamped > 0 && cells > 0) {
        const fillRight = '▓'.repeat(cells);
        const emptyRight = '░'.repeat(BAR_HALF_WIDTH - cells);
        const ansi = positiveAnsi;
        const reset = ansi ? FG_RESET : '';
        return `${'░'.repeat(BAR_HALF_WIDTH)}│${ansi}${fillRight}${reset}${emptyRight}`;
    }

    return `${'░'.repeat(BAR_HALF_WIDTH)}│${'░'.repeat(BAR_HALF_WIDTH)}`;
}

export class WeeklyBudgetBufferWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Weekly quota buffer vs. even-spread pace (1 day = 100%)'; }
    getDisplayName(): string { return 'Weekly Budget Buffer'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const colorLevel = getColorLevelString(settings.colorLevel);
        const positiveAnsi = getColorAnsiCode(getPositiveColor(item), colorLevel, false);
        const negativeAnsi = getColorAnsiCode(getNegativeColor(item), colorLevel, false);

        if (context.isPreview) {
            const previewBuffer = 28;
            const bar = renderBipolarBar(previewBuffer, positiveAnsi, negativeAnsi);
            return `Buffer: ${bar} ${formatSignedPercent(previewBuffer)}`;
        }

        const data = context.usageData ?? {};
        if (data.error) {
            return getUsageErrorMessage(data.error);
        }
        if (data.weeklyUsage === undefined) {
            return null;
        }

        const window = resolveWeeklyUsageWindow(data);
        if (!window) {
            return null;
        }

        const buffer = computeBudgetBufferPercent(data.weeklyUsage, window.elapsedPercent);
        const bar = renderBipolarBar(buffer, positiveAnsi, negativeAnsi);
        return `Buffer: ${bar} ${formatSignedPercent(buffer)}`;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(): boolean { return false; }
}
