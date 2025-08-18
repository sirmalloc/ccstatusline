import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { Settings } from '../../types/Settings';
import { type PowerlineFontStatus } from '../../utils/powerline';

export interface MainMenuProps {
    onSelect: (value: string) => void;
    isClaudeInstalled: boolean;
    hasChanges: boolean;
    initialSelection?: number;
    powerlineFontStatus: PowerlineFontStatus;
    settings: Settings | null;
    previewIsTruncated?: boolean;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onSelect, isClaudeInstalled, hasChanges, initialSelection = 0, powerlineFontStatus, settings, previewIsTruncated }) => {
    const [selectedIndex, setSelectedIndex] = useState(initialSelection);

    // Build menu structure with visual gaps
    const menuItems = [
        { label: '📝 Edit Lines', value: 'lines', selectable: true },
        { label: '🎨 Edit Colors', value: 'colors', selectable: true },
        { label: '⚡ Powerline Setup', value: 'powerline', selectable: true },
        { label: '', value: '_gap1', selectable: false },  // Visual gap
        { label: '💻 Terminal Options', value: 'terminalConfig', selectable: true },
        { label: '🌐 Global Overrides', value: 'globalOverrides', selectable: true },
        { label: '', value: '_gap2', selectable: false },  // Visual gap
        { label: isClaudeInstalled ? '🔌 Uninstall from Claude Code' : '📦 Install to Claude Code', value: 'install', selectable: true }
    ];

    if (hasChanges) {
        menuItems.push(
            { label: '💾 Save & Exit', value: 'save', selectable: true },
            { label: '❌ Exit without saving', value: 'exit', selectable: true }
        );
    } else {
        menuItems.push({ label: '🚪 Exit', value: 'exit', selectable: true });
    }

    // Get only selectable items for navigation
    const selectableItems = menuItems.filter(item => item.selectable);

    useInput((input, key) => {
        if (key.upArrow) {
            setSelectedIndex(Math.max(0, selectedIndex - 1));
        } else if (key.downArrow) {
            setSelectedIndex(Math.min(selectableItems.length - 1, selectedIndex + 1));
        } else if (key.return) {
            const item = selectableItems[selectedIndex];
            if (item) {
                onSelect(item.value);
            }
        }
    });

    // Get description for selected item
    const getDescription = (value: string): string => {
        const descriptions: Record<string, string> = {
            lines: 'Configure up to 3 status lines with various widgets like model info, git status, and token usage',
            colors: 'Customize colors for each widget including foreground, background, and bold styling',
            powerline: 'Install Powerline fonts for enhanced visual separators and symbols in your status line',
            globalOverrides: 'Set global padding, separators, and color overrides that apply to all widgets',
            install: isClaudeInstalled
                ? 'Remove ccstatusline from your Claude Code settings'
                : 'Add ccstatusline to your Claude Code settings for automatic status line rendering',
            terminalConfig: 'Configure terminal-specific settings for optimal display',
            save: 'Save all changes and exit the configuration tool',
            exit: hasChanges
                ? 'Exit without saving your changes'
                : 'Exit the configuration tool'
        };
        return descriptions[value] ?? '';
    };

    const selectedItem = selectableItems[selectedIndex];
    const description = selectedItem ? getDescription(selectedItem.value) : '';

    // Check if we should show the truncation warning
    const showTruncationWarning = previewIsTruncated && settings?.flexMode === 'full-minus-40';

    return (
        <Box flexDirection='column'>
            {showTruncationWarning && (
                <Box marginBottom={1}>
                    <Text color='yellow'>⚠ Some lines are truncated, see Terminal Options → Terminal Width for info</Text>
                </Box>
            )}
            <Text bold>Main Menu</Text>
            <Box marginTop={1} flexDirection='column'>
                {menuItems.map((item, idx) => {
                    if (!item.selectable && item.value.startsWith('_gap')) {
                        return <Text key={item.value}> </Text>;
                    }
                    const selectableIdx = selectableItems.indexOf(item);
                    const isSelected = selectableIdx === selectedIndex;

                    return (
                        <Text
                            key={item.value}
                            color={isSelected ? 'green' : undefined}
                        >
                            {isSelected ? '▶  ' : '   '}
                            {item.label}
                        </Text>
                    );
                })}
            </Box>
            {description && (
                <Box marginTop={1} paddingLeft={2}>
                    <Text dimColor wrap='wrap'>{description}</Text>
                </Box>
            )}
        </Box>
    );
};