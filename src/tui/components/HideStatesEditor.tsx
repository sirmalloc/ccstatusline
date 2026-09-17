import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type {
    HideableState,
    WidgetItem
} from '../../types/Widget';
import {
    MERGE_TARGET_HIDDEN_HIDEABLE_STATE,
    getEnabledHideStates,
    setEnabledHideStates
} from '../../widgets/shared/hideable';

export interface HideStatesEditorProps {
    widget: WidgetItem;
    states: HideableState[];
    onComplete: (updatedWidget: WidgetItem) => void;
    onCancel: () => void;
}

export const HideStatesEditor: React.FC<HideStatesEditorProps> = ({ widget, states, onComplete, onCancel }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [enabledKeys, setEnabledKeys] = useState<string[]>(() => getEnabledHideStates(widget, states));

    useInput((input, key) => {
        if (key.return) {
            onComplete(setEnabledHideStates(widget, states, enabledKeys));
        } else if (key.escape) {
            onCancel();
        } else if (key.upArrow && states.length > 0) {
            setSelectedIndex(selectedIndex - 1 < 0 ? states.length - 1 : selectedIndex - 1);
        } else if (key.downArrow && states.length > 0) {
            setSelectedIndex(selectedIndex + 1 > states.length - 1 ? 0 : selectedIndex + 1);
        } else if (input === ' ') {
            const state = states[selectedIndex];
            if (state) {
                setEnabledKeys(enabledKeys.includes(state.key)
                    ? enabledKeys.filter(enabledKey => enabledKey !== state.key)
                    : [...enabledKeys, state.key]);
            }
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Hide</Text>
            <Text dimColor>↑↓ select, Space toggle, Enter save, ESC cancel</Text>
            <Box marginTop={1} flexDirection='column'>
                {states.map((state, index) => {
                    const isSelected = index === selectedIndex;
                    const isEnabled = enabledKeys.includes(state.key);
                    return (
                        <Box key={state.key} flexDirection='row' flexWrap='nowrap'>
                            <Box width={3}>
                                <Text color={isSelected ? 'green' : undefined}>
                                    {isSelected ? '▶ ' : '  '}
                                </Text>
                            </Box>
                            <Text color={isSelected ? 'green' : undefined}>
                                {`[${isEnabled ? 'x' : ' '}] ${state.label}`}
                            </Text>
                            {state.key === MERGE_TARGET_HIDDEN_HIDEABLE_STATE.key && !widget.merge && (
                                <Text dimColor> (requires merge)</Text>
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};
