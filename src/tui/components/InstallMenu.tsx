import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

export interface InstallMenuProps {
    bunxAvailable: boolean;
    existingStatusLine: string | null;
    onSelectNpx: () => void;
    onSelectBunx: () => void;
    onCancel: () => void;
}

export const InstallMenu: React.FC<InstallMenuProps> = ({
    bunxAvailable,
    existingStatusLine,
    onSelectNpx,
    onSelectBunx,
    onCancel
}) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const maxIndex = 2; // npx, bunx (if available), and back

    useInput((input, key) => {
        if (key.escape) {
            onCancel();
        } else if (key.upArrow) {
            if (selectedIndex === 2) {
                setSelectedIndex(bunxAvailable ? 1 : 0); // Skip bunx if not available
            } else {
                setSelectedIndex(Math.max(0, selectedIndex - 1));
            }
        } else if (key.downArrow) {
            if (selectedIndex === 0) {
                setSelectedIndex(bunxAvailable ? 1 : 2); // Skip bunx if not available
            } else if (selectedIndex === 1 && bunxAvailable) {
                setSelectedIndex(2);
            } else {
                setSelectedIndex(Math.min(maxIndex, selectedIndex + 1));
            }
        } else if (key.return) {
            if (selectedIndex === 0) {
                onSelectNpx();
            } else if (selectedIndex === 1 && bunxAvailable) {
                onSelectBunx();
            } else if (selectedIndex === 2) {
                onCancel();
            }
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Install ccstatusline to Claude Code</Text>

            {existingStatusLine && (
                <Box marginBottom={1}>
                    <Text color='yellow'>
                        ⚠ Current status line: "
                        {existingStatusLine}
                        "
                    </Text>
                </Box>
            )}

            <Box>
                <Text dimColor>Select package manager to use:</Text>
            </Box>

            <Box marginTop={1} flexDirection='column'>
                <Box>
                    <Text color={selectedIndex === 0 ? 'blue' : undefined}>
                        {selectedIndex === 0 ? '▶  ' : '   '}
                        npx - Node Package Execute
                    </Text>
                </Box>

                <Box>
                    <Text color={selectedIndex === 1 && bunxAvailable ? 'blue' : undefined} dimColor={!bunxAvailable}>
                        {selectedIndex === 1 && bunxAvailable ? '▶  ' : '   '}
                        bunx - Bun Package Execute
                        {!bunxAvailable && ' (not installed)'}
                    </Text>
                </Box>

                <Box marginTop={1}>
                    <Text color={selectedIndex === 2 ? 'blue' : undefined}>
                        {selectedIndex === 2 ? '▶  ' : '   '}
                        ← Back
                    </Text>
                </Box>
            </Box>

            <Box marginTop={2}>
                <Text dimColor>
                    The selected command will be written to ~/.claude/settings.json
                </Text>
            </Box>

            <Box marginTop={1}>
                <Text dimColor>Press Enter to select, ESC to cancel</Text>
            </Box>
        </Box>
    );
};