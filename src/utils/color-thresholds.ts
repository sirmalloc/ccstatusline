import type { WidgetItem } from '../types/Widget';

export type ThresholdPreset = 'default' | 'conservative' | 'aggressive' | 'off';

export interface ThresholdConfig {
    warn: number;
    crit: number;
    warnColor: string;
    critColor: string;
}

export const THRESHOLD_PRESETS: Record<ThresholdPreset, ThresholdConfig | null> = {
    default: { warn: 50, crit: 75, warnColor: 'yellow', critColor: 'red' },
    conservative: { warn: 30, crit: 60, warnColor: 'yellow', critColor: 'red' },
    aggressive: { warn: 70, crit: 90, warnColor: 'yellow', critColor: 'red' },
    off: null
};

export const THRESHOLD_CYCLE_ORDER: ThresholdPreset[] = ['default', 'conservative', 'aggressive', 'off'];

/**
 * Get the effective color for a context percentage widget based on usage thresholds.
 * Uses the USAGE percentage (how full context is), regardless of inverse display mode.
 */
export function getContextThresholdColor(item: WidgetItem, usagePercentage: number): string | undefined {
    if (item.metadata?.colorThresholds === 'false') return undefined;

    const preset = (item.metadata?.thresholdPreset as ThresholdPreset) ?? 'default';
    const config = THRESHOLD_PRESETS[preset];
    if (!config) return undefined;

    if (usagePercentage >= config.crit) return config.critColor;
    if (usagePercentage >= config.warn) return config.warnColor;
    return undefined;
}

/**
 * Get the current threshold preset from widget metadata.
 */
export function getCurrentPreset(item: WidgetItem): ThresholdPreset {
    if (item.metadata?.colorThresholds === 'false') return 'off';
    return (item.metadata?.thresholdPreset as ThresholdPreset) ?? 'default';
}

/**
 * Get display label for a threshold preset.
 */
export function getPresetLabel(preset: ThresholdPreset): string {
    switch (preset) {
    case 'default': return 'thresholds: 50/75%';
    case 'conservative': return 'thresholds: 30/60%';
    case 'aggressive': return 'thresholds: 70/90%';
    case 'off': return 'thresholds: off';
    }
}
