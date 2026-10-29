import type { Settings } from '../types/Settings';

import { getDefaultPowerlineTheme } from './colors';

function resolveEnabledPowerlineTheme(theme: string | undefined): string {
    if (!theme || theme === 'custom') {
        return getDefaultPowerlineTheme();
    }

    return theme;
}

export function buildEnabledPowerlineSettings(settings: Settings): Settings {
    const powerlineConfig = settings.powerline;

    return {
        ...settings,
        powerline: {
            ...powerlineConfig,
            enabled: true,
            theme: resolveEnabledPowerlineTheme(powerlineConfig.theme),
            // Separators are initialized by schema defaults, preserve existing values.
            separators: powerlineConfig.separators,
            separatorInvertBackground: powerlineConfig.separatorInvertBackground
        },
        defaultPadding: ' '
    };
}
