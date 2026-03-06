import chalk from 'chalk';
import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { Settings } from '../../types/Settings';
import {
    hasCustomWidgetColors,
    sanitizeLinesForColorLevel
} from '../../utils/color-sanitize';

import { ConfirmDialog } from './ConfirmDialog';
import {
    List,
    type ListEntry
} from './List';

type TerminalOptionsValue = 'width' | 'colorLevel';

export function getNextColorLevel(level: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
    return ((level + 1) % 4) as 0 | 1 | 2 | 3;
}

export function shouldWarnOnColorLevelChange(
    currentLevel: 0 | 1 | 2 | 3,
    nextLevel: 0 | 1 | 2 | 3,
    hasCustomColors: boolean
): boolean {
    return hasCustomColors
        && ((currentLevel === 2 && nextLevel !== 2)
            || (currentLevel === 3 && nextLevel !== 3));
}

export function buildTerminalOptionsItems(
    colorLevel: 0 | 1 | 2 | 3
): ListEntry<TerminalOptionsValue>[] {
    return [
        {
            label: '◱ Terminal Width',
            value: 'width',
            description: 'Configure how the status line uses available terminal width and when it should compact.'
        },
        {
            label: '▓ Color Level',
            sublabel: `(${getColorLevelLabel(colorLevel)})`,
            value: 'colorLevel',
            description: [
                'Color level affects how colors are rendered:',
                '• Truecolor: Full 24-bit RGB colors (16.7M colors)',
                '• 256 Color: Extended color palette (256 colors)',
                '• Basic: Standard 16-color terminal palette',
                '• No Color: Disables all color output'
            ].join('\n')
        }
    ];
}

export interface TerminalOptionsMenuProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: (target?: string) => void;
}

export const TerminalOptionsMenu: React.FC<TerminalOptionsMenuProps> = ({
    settings,
    onUpdate,
    onBack
}) => {
    const [showColorWarning, setShowColorWarning] = useState(false);
    const [pendingColorLevel, setPendingColorLevel] = useState<0 | 1 | 2 | 3 | null>(null);

    const handleSelect = (value: TerminalOptionsValue | 'back') => {
        if (value === 'back') {
            onBack();
            return;
        }

        if (value === 'width') {
            onBack('width');
            return;
        }

        const hasCustomColors = hasCustomWidgetColors(settings.lines);
        const currentLevel = settings.colorLevel;
        const nextLevel = getNextColorLevel(currentLevel);

        if (shouldWarnOnColorLevelChange(currentLevel, nextLevel, hasCustomColors)) {
            setShowColorWarning(true);
            setPendingColorLevel(nextLevel);
            return;
        }

        chalk.level = nextLevel;

        const cleanedLines = sanitizeLinesForColorLevel(settings.lines, nextLevel);

        onUpdate({
            ...settings,
            lines: cleanedLines,
            colorLevel: nextLevel
        });
    };

    const handleColorConfirm = () => {
        if (pendingColorLevel !== null) {
            chalk.level = pendingColorLevel;

            const cleanedLines = sanitizeLinesForColorLevel(settings.lines, pendingColorLevel);

            onUpdate({
                ...settings,
                lines: cleanedLines,
                colorLevel: pendingColorLevel
            });
        }
        setShowColorWarning(false);
        setPendingColorLevel(null);
    };

    const handleColorCancel = () => {
        setShowColorWarning(false);
        setPendingColorLevel(null);
    };

    useInput((_, key) => {
        if (key.escape && !showColorWarning) {
            onBack();
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Terminal Options</Text>
            {showColorWarning ? (
                <Box flexDirection='column' marginTop={1}>
                    <Text color='yellow'>⚠ Warning: Custom colors detected!</Text>
                    <Text>Switching color modes will reset custom ansi256 or hex colors to defaults.</Text>
                    <Box marginTop={1}>
                        <ConfirmDialog
                            message='Continue?'
                            onConfirm={handleColorConfirm}
                            onCancel={handleColorCancel}
                            inline
                        />
                    </Box>
                </Box>
            ) : (
                <>
                    <Text color='white'>Configure terminal-specific settings for optimal display</Text>
                    <List
                        marginTop={1}
                        items={buildTerminalOptionsItems(settings.colorLevel)}
                        onSelect={handleSelect}
                        showBackButton={true}
                    />
                </>
            )}
        </Box>
    );
};

export const getColorLevelLabel = (level?: 0 | 1 | 2 | 3): string => {
    switch (level) {
        case 0: return 'No Color';
        case 1: return 'Basic';
        case 2:
        case undefined: return '256 Color (default)';
        case 3: return 'Truecolor';
        default: return '256 Color (default)';
    }
};