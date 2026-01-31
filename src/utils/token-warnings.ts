import chalk from 'chalk';

import type { Settings } from '../types/Settings';

export function applyTokenWarning(baseText: string, tokenCount: number, settings: Settings): string {
    // Get token warnings config with defaults
    const tokenWarnings = settings.tokenWarnings as {
        enabled?: boolean;
        warningThreshold?: number;
        criticalThreshold?: number;
        showEmojis?: boolean;
    } | undefined;

    // If warnings are disabled, return original text
    if (tokenWarnings?.enabled === false) {
        return baseText;
    }

    // Get thresholds with defaults
    const warningThreshold = tokenWarnings?.warningThreshold ?? 120000;
    const criticalThreshold = tokenWarnings?.criticalThreshold ?? 140000;
    const showEmojis = tokenWarnings?.showEmojis ?? true;

    // Check thresholds and apply styling
    if (tokenCount >= criticalThreshold) {
        // Critical: red background + bold
        const prefix = showEmojis ? '🔴 ' : '';
        return chalk.bold.red.bgRed(prefix + baseText);
    } else if (tokenCount >= warningThreshold) {
        // Warning: yellow + bold
        const prefix = showEmojis ? '⚠️  ' : '';
        return chalk.bold.yellow(prefix + baseText);
    }

    // Below thresholds: return original text
    return baseText;
}