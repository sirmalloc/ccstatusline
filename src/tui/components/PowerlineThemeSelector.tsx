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
import {
    NO_THEME_SLOT,
    assignPowerlineThemeSlots,
    computeLineThemeStartIndices
} from '../../utils/powerline-theme-index';

import { ConfirmDialog } from './ConfirmDialog';
import {
    List,
    type ListEntry
} from './List';
import { clearAllPins } from './color-menu/mutations';

export function buildPowerlineThemeItems(
    themes: string[],
    originalTheme: string
): ListEntry<string>[] {
    return themes.map((themeName) => {
        const theme = getPowerlineTheme(themeName);

        return {
            label: theme?.name ?? themeName,
            sublabel: themeName === originalTheme ? '(original)' : undefined,
            value: themeName,
            description: theme?.description ?? ''
        };
    });
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

    // Bake in the slots the shared helper assigns, so what gets written matches the theme
    // the user was just looking at - merged widgets share a color, separators break a run.
    // Content is a placeholder for every widget because these colors are written to config
    // for good: a widget that happens to render nothing right now still needs its color for
    // the renders where it does have output.
    const placeholderContentLines = settings.lines.map(line => line.map(widget => ({
        widget,
        content: 'x'
    })));
    const lineStartIndices = computeLineThemeStartIndices(
        placeholderContentLines,
        settings.powerline.continueThemeAcrossLines
    );

    const lines = settings.lines.map((line, lineIndex) => {
        const slots = assignPowerlineThemeSlots(
            placeholderContentLines[lineIndex] ?? [],
            lineStartIndices[lineIndex] ?? 0
        );

        return line.map((widget, widgetIndex) => {
            const slot = slots[widgetIndex];
            if (slot === undefined || slot === NO_THEME_SLOT) {
                return widget;
            }

            // Every widget ends up carrying its own explicit colour, which is exactly what a
            // pin asks for - so the pins are now redundant. Leaving them set would hide them
            // (the row tag needs a real theme) and revive them on the next theme change.
            const {
                pinColor,
                pinBackgroundColor,
                ...restWidget
            } = widget;
            void pinColor; // Intentionally unused
            void pinBackgroundColor; // Intentionally unused

            return {
                ...restWidget,
                color: themeColors.fg[slot % themeColors.fg.length],
                backgroundColor: themeColors.bg[slot % themeColors.bg.length]
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

export interface PowerlineThemeSelectorProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

export const PowerlineThemeSelector: React.FC<PowerlineThemeSelectorProps> = ({
    settings,
    onUpdate,
    onBack
}) => {
    const themes = useMemo(() => getPowerlineThemes(), []);
    const currentTheme = settings.powerline.theme ?? 'custom';
    const [selectedIndex, setSelectedIndex] = useState(Math.max(0, themes.indexOf(currentTheme)));
    const [showCustomizeConfirm, setShowCustomizeConfirm] = useState(false);
    const [showRemovePinsConfirm, setShowRemovePinsConfirm] = useState(false);
    const originalThemeRef = useRef(currentTheme);
    const originalSettingsRef = useRef(settings);
    const latestSettingsRef = useRef(settings);
    const latestOnUpdateRef = useRef(onUpdate);
    const didHandleInitialSelectionRef = useRef(false);

    // The live-preview effect below runs on selectedIndex alone, so it would close over a
    // stale settings/onUpdate pair; these refs keep it reading the current ones. Everything
    // driven directly by a keypress - the confirm handlers, onSelect - renders first and can
    // read the `settings` prop, which is why the two do not use the same source.
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
            powerline: {
                ...latestSettingsRef.current.powerline,
                theme: themeName
            }
        });
    }, [selectedIndex, themes]);

    useInput((input, key) => {
        if (showCustomizeConfirm || showRemovePinsConfirm) {
            return;
        }

        if (key.escape) {
            onUpdate(originalSettingsRef.current);
            onBack();
        } else if (input === 'c' || input === 'C') {
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

    if (showRemovePinsConfirm) {
        return (
            <Box flexDirection='column'>
                <Text bold color='yellow'>⚠ Custom Color Overrides</Text>
                <Box marginTop={1} flexDirection='column'>
                    <Text>Some widgets have pinned colors that override the theme.</Text>
                    <Text>Remove them so the new theme fully applies?</Text>
                    <Text dimColor>Yes removes the overrides; No keeps them; ESC cancels the theme change.</Text>
                </Box>
                <Box marginTop={1}>
                    <ConfirmDialog
                        inline={true}
                        // Reached by pressing Enter on the theme list, so a second Enter must
                        // not be what wipes every pin.
                        defaultChoice='no'
                        onConfirm={() => {
                            onUpdate({
                                ...settings,
                                lines: settings.lines.map(line => clearAllPins(line))
                            });
                            setShowRemovePinsConfirm(false);
                            onBack();
                        }}
                        onCancel={() => {
                            setShowRemovePinsConfirm(false);
                            onBack();
                        }}
                        // Yes and No both apply the theme, so without this ESC would commit a
                        // theme the user was only previewing - the opposite of what the
                        // screen's own "ESC cancel" hint promises.
                        onEscape={() => {
                            setShowRemovePinsConfirm(false);
                            onUpdate(originalSettingsRef.current);
                            onBack();
                        }}
                    />
                </Box>
            </Box>
        );
    }

    return (
        <Box flexDirection='column'>
            <Text bold>
                {`Powerline Theme Selection  |  `}
                <Text dimColor>
                    {`Original: ${originalThemeRef.current}`}
                </Text>
            </Text>
            <Box>
                <Text dimColor>
                    {`↑↓ navigate, Enter apply${selectedThemeName && selectedThemeName !== 'custom' ? ', (c)ustomize theme' : ''}, ESC cancel`}
                </Text>
            </Box>

            <List
                marginTop={1}
                items={themeItems}
                onSelect={() => {
                    const chosenTheme = themes[selectedIndex] ?? 'custom';
                    const themeChanged = chosenTheme !== originalThemeRef.current;
                    const hasPins = settings.lines.some(line => line.some(
                        widget => Boolean(widget.pinColor) || Boolean(widget.pinBackgroundColor)
                    ));
                    // On 'custom' every widget's own colour already applies, so a pin
                    // overrides nothing - offering to destroy them would be pure loss. Any
                    // later switch to a real theme prompts again.
                    if (themeChanged && hasPins && chosenTheme !== 'custom') {
                        setShowRemovePinsConfirm(true);
                        return;
                    }
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

            {selectedThemeName && selectedThemeName !== 'custom' && (
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
