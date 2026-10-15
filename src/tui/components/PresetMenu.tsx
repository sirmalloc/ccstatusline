import {
    Box,
    Text
} from 'ink';
import React from 'react';

import {
    PRESETS,
    type PresetName
} from '../../utils/presets';

import { List } from './List';

interface PresetMenuProps {
    firstRun: boolean;
    onApply: (name: PresetName) => void;
    onSkip: () => void;
}

export function PresetMenu({ firstRun, onApply, onSkip }: PresetMenuProps) {
    return (
        <Box flexDirection='column'>
            <Text bold>
                {firstRun
                    ? 'Welcome to ccstatusline — pick a starting preset'
                    : 'Presets'}
            </Text>
            {!firstRun && (
                <Text color='yellow'>
                    Applying a preset replaces your entire configuration.
                </Text>
            )}
            <List
                marginTop={1}
                showBackButton
                items={PRESETS.map(preset => ({
                    label: preset.title,
                    sublabel: preset.name,
                    description: preset.description,
                    value: preset.name
                }))}
                onSelect={(value) => {
                    if (value === 'back') {
                        onSkip();
                        return;
                    }
                    onApply(value);
                }}
            />
        </Box>
    );
}
