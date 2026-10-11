import {
    Box,
    Text,
    useInput
} from 'ink';
import React, {
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';

import { getColorLevelString } from '../../types/ColorLevel';
import type { Settings } from '../../types/Settings';
import {
    getPowerlineTheme,
    getPowerlineThemes
} from '../../utils/colors';
import { getPlainInput } from '../../utils/input-guards';
import { assignPowerlineThemeSlots } from '../../utils/powerline-theme-index';

import { ConfirmDialog } from './ConfirmDialog';
import {
    List,
    type ListEntry
} from './List';

export function buildPowerlineThemeItems(
    themes: string[],
    originalTheme: string
): ListEntry<string>[] {
    return themes.map((themeName) => {
        const theme = getPowerlineTheme(themeName);
        const fallbackLabel = themeName === 'inherit'
            ? 'Inherit global theme'
            : themeName === 'none' ? 'None (no theme)' : themeName;

        return {
            label: theme?.name ?? fallbackLabel,
            sublabel: themeName === originalTheme ? '(original)' : undefined,
            value: themeName,
            description: theme?.description ?? (themeName === 'inherit' ? 'Uses the global theme for this line' : '')
        };
    });
}

// Write one line's theme into a dense (no holes) copy of lineThemes: sparse
// arrays JSON-serialize undefined entries as null, which the settings schema
// rejects on reload.
function withLineTheme(
    lineThemes: (string | null | undefined)[] | undefined,
    lineIndex: number,
    theme: string | undefined
): (string | undefined)[] {
    const next = Array.from({ length: Math.max(lineIndex + 1, lineThemes?.length ?? 0) }, (_, i) => lineThemes?.[i] ?? undefined);
    next[lineIndex] = theme;
    return next;
}

export function applyCustomPowerlineTheme(
    settings: Settings,
    themeName: string
): Settings | null {
    const theme = getPowerlineTheme(themeName);

    if (!theme || themeName === 'custom') {
        return null;
    }

    const colorLevel = getColorLevelString(settings.colorLevel);
    const colorLevelKey = colorLevel === 'ansi16' ? '1' : colorLevel === 'ansi256' ? '2' : '3';
    const themeColors = theme[colorLevelKey];

    if (!themeColors) {
        return null;
    }

    // Number the widgets the way the renderer picks theme colors, so the copy
    // matches what the theme showed: a merged group shares one color, and with
    // Continue Theme on, each line picks up where the previous one stopped
    let nextLineSlot = 0;
    const lines = settings.lines.map((line) => {
        const { slots, nextSlot } = assignPowerlineThemeSlots(
            line,
            settings.powerline.continueThemeAcrossLines ? nextLineSlot : 0
        );
        nextLineSlot = nextSlot;

        return line.map((widget, index) => {
            const slot = slots[index];
            if (typeof slot !== 'number') {
                return widget;
            }

            const fgColor = themeColors.fg[slot % themeColors.fg.length];
            const bgColor = themeColors.bg[slot % themeColors.bg.length];

            return {
                ...widget,
                color: fgColor,
                backgroundColor: bgColor
            };
        });
    });

    return {
        ...settings,
        powerline: {
            ...settings.powerline,
            theme: 'custom'
        },
        lines
    };
}

export type ThemeSelectorMode = 'powerline' | 'regular';

export interface PowerlineThemeSelectorProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
    // 'regular' targets the top-level theme applied in non-powerline mode
    // (settings.theme); defaults to the powerline theme picker behavior.
    mode?: ThemeSelectorMode;
    // When set, the picker edits that line's theme override
    // (settings.lineThemes[lineIndex]) instead of the global theme.
    lineIndex?: number;
}

export const PowerlineThemeSelector: React.FC<PowerlineThemeSelectorProps> = ({
    settings,
    onUpdate,
    onBack,
    mode = 'powerline',
    lineIndex
}) => {
    const isRegular = mode === 'regular';
    const isPerLine = lineIndex !== undefined;
    const targetLine = lineIndex ?? 0;
    const themes = useMemo(
        () => (isPerLine
            ? ['inherit', 'none', ...getPowerlineThemes().filter(name => name !== 'custom')]
            : isRegular
                ? ['none', ...getPowerlineThemes().filter(name => name !== 'custom')]
                : getPowerlineThemes()),
        [isRegular, isPerLine]
    );
    const currentTheme = isPerLine
        ? settings.lineThemes?.[targetLine] ?? 'inherit'
        : isRegular
            ? settings.theme ?? 'none'
            : settings.powerline.theme ?? 'custom';
    const [selectedIndex, setSelectedIndex] = useState(Math.max(0, themes.indexOf(currentTheme)));
    const [showCustomizeConfirm, setShowCustomizeConfirm] = useState(false);
    const originalThemeRef = useRef(currentTheme);
    const originalSettingsRef = useRef(settings);
    const latestSettingsRef = useRef(settings);
    const latestOnUpdateRef = useRef(onUpdate);
    const didHandleInitialSelectionRef = useRef(false);

    useEffect(() => {
        latestSettingsRef.current = settings;
        latestOnUpdateRef.current = onUpdate;
    }, [settings, onUpdate]);

    useEffect(() => {
        const themeName = themes[selectedIndex];

        if (!themeName) {
            return;
        }

        if (!didHandleInitialSelectionRef.current) {
            didHandleInitialSelectionRef.current = true;
            return;
        }

        latestOnUpdateRef.current({
            ...latestSettingsRef.current,
            ...(isPerLine
                ? {
                    lineThemes: withLineTheme(
                        latestSettingsRef.current.lineThemes,
                        targetLine,
                        themeName === 'inherit' ? undefined : themeName
                    )
                }
                : isRegular
                    ? { theme: themeName === 'none' ? undefined : themeName }
                    : {
                        powerline: {
                            ...latestSettingsRef.current.powerline,
                            theme: themeName
                        }
                    })
        });
    }, [selectedIndex, themes, isRegular, isPerLine, targetLine]);

    useInput((input, key) => {
        const shortcut = getPlainInput(input, key);
        if (showCustomizeConfirm) {
            return;
        }

        if (key.escape) {
            onUpdate(originalSettingsRef.current);
            onBack();
        } else if (!isRegular && !isPerLine && (shortcut === 'c' || shortcut === 'C')) {
            const currentThemeName = themes[selectedIndex];
            if (currentThemeName && currentThemeName !== 'custom') {
                setShowCustomizeConfirm(true);
            }
        }
    });

    const selectedThemeName = themes[selectedIndex];
    const themeItems = useMemo(
        () => buildPowerlineThemeItems(themes, originalThemeRef.current),
        [themes]
    );

    if (showCustomizeConfirm) {
        return (
            <Box flexDirection='column'>
                <Text bold color='yellow'>⚠ Confirm Customization</Text>
                <Box marginTop={1} flexDirection='column'>
                    <Text>This will copy the current theme colors to your widgets</Text>
                    <Text>and switch to Custom theme mode.</Text>
                    <Text color='red'>This will overwrite any existing custom colors!</Text>
                </Box>
                <Box marginTop={2}>
                    <Text>Continue?</Text>
                </Box>
                <Box marginTop={1}>
                    <ConfirmDialog
                        inline={true}
                        onConfirm={() => {
                            if (selectedThemeName) {
                                const updatedSettings = applyCustomPowerlineTheme(settings, selectedThemeName);
                                if (updatedSettings) {
                                    onUpdate(updatedSettings);
                                }
                            }
                            setShowCustomizeConfirm(false);
                            onBack();
                        }}
                        onCancel={() => {
                            setShowCustomizeConfirm(false);
                        }}
                    />
                </Box>
            </Box>
        );
    }

    return (
        <Box flexDirection='column'>
            <Text bold>
                {`${isPerLine ? `Theme for line ${targetLine + 1}` : isRegular ? 'Theme Selection (regular mode)' : 'Powerline Theme Selection'}  |  `}
                <Text dimColor>
                    {`Original: ${originalThemeRef.current}`}
                </Text>
            </Text>
            <Box>
                <Text dimColor>
                    {`↑↓ navigate, Enter apply${!isRegular && !isPerLine && selectedThemeName && selectedThemeName !== 'custom' ? ', (c)ustomize theme' : ''}, ESC cancel`}
                </Text>
            </Box>

            <List
                marginTop={1}
                items={themeItems}
                onSelect={() => {
                    onBack();
                }}
                onSelectionChange={(themeName, index) => {
                    if (themeName === 'back') {
                        return;
                    }

                    setSelectedIndex(index);
                }}
                initialSelection={selectedIndex}
            />

            {!isRegular && !isPerLine && selectedThemeName && selectedThemeName !== 'custom' && (
                <Box marginTop={1}>
                    <Text dimColor>Press (c) to customize this theme - copies colors to widgets</Text>
                </Box>
            )}
            {settings.colorLevel === 1 && (
                <Box marginTop={1}>
                    <Text color='yellow'>⚠ 16 color mode themes have a very limited palette, we recommend switching color level in Terminal Options</Text>
                </Box>
            )}
        </Box>
    );
};
