import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type {
    Settings,
    UsageTrackerConfig
} from '../../types/Settings';
import { shouldInsertInput } from '../../utils/input-guards';
import { getResolvedLogPath } from '../../utils/usage-log';
import { hasUsageDependentWidgets } from '../../utils/usage-prefetch';

import {
    List,
    type ListEntry
} from './List';

type UsageTrackerValue = 'enabled' | 'logApiUsage' | 'heartbeatMinutes' | 'rotateMaxMb';

export const API_POLLING_WARNING
    = '⚠ No usage widgets are configured - enabling API logging will start polling the Anthropic usage API '
        + '(~1 request / 3 min across all sessions).';

export function shouldWarnAboutApiPolling(config: UsageTrackerConfig, lines: Settings['lines']): boolean {
    return config.enabled && config.logApiUsage && !hasUsageDependentWidgets(lines);
}

export function validateHeartbeatMinutesInput(value: string): string | null {
    const parsed = parseInt(value, 10);

    if (value === '' || isNaN(parsed)) {
        return 'Please enter a valid number';
    }

    if (parsed < 1) {
        return `Minimum heartbeat interval is 1 min (you entered ${parsed} min)`;
    }

    if (parsed > 120) {
        return `Maximum heartbeat interval is 120 min (you entered ${parsed} min)`;
    }

    return null;
}

export function validateRotateMaxMbInput(value: string): string | null {
    const parsed = parseInt(value, 10);

    if (value === '' || isNaN(parsed)) {
        return 'Please enter a valid number';
    }

    if (parsed < 1) {
        return `Minimum log size is 1 MB (you entered ${parsed} MB)`;
    }

    if (parsed > 100) {
        return `Maximum log size is 100 MB (you entered ${parsed} MB)`;
    }

    return null;
}

export function buildUsageTrackerItems(config: UsageTrackerConfig): ListEntry<UsageTrackerValue>[] {
    return [
        {
            label: '📊 Usage Tracking',
            sublabel: config.enabled ? '(enabled)' : '(disabled)',
            value: 'enabled',
            description: 'Append every distinct rate limit observation to a JSONL log file for later analysis.\nOnly usage percentages, timestamps and a hashed account id are written - never tokens or credentials.'
        },
        {
            label: '🌐 API Usage Logging',
            sublabel: config.logApiUsage ? '(on)' : '(off)',
            disabled: !config.enabled,
            value: 'logApiUsage',
            description: 'Also log the Anthropic usage API responses, which carry more detail than the status line payload.\nTurn this off to log only what Claude Code already sends, without causing any API request.'
        },
        {
            label: '💓 Heartbeat Interval',
            sublabel: `(${config.heartbeatMinutes} min)`,
            disabled: !config.enabled,
            value: 'heartbeatMinutes',
            description: 'How long the log can stay quiet before a heartbeat record is appended. Heartbeats make gaps unambiguous:\nthey distinguish "no usage" from "ccstatusline was not running". Enter 1-120 minutes.'
        },
        {
            label: '♻️ Log Rotation Size',
            sublabel: `(${config.rotateMaxMb} MB)`,
            disabled: !config.enabled,
            value: 'rotateMaxMb',
            description: 'Maximum log size before it is rotated to a .1.jsonl file. One rotated file is kept, so disk usage stays\nbounded at roughly twice this value. Enter 1-100 MB.'
        }
    ];
}

export interface UsageTrackerMenuProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

export const UsageTrackerMenu: React.FC<UsageTrackerMenuProps> = ({
    settings,
    onUpdate,
    onBack
}) => {
    const config = settings.usageTracker;
    const [editingHeartbeat, setEditingHeartbeat] = useState(false);
    const [editingRotateSize, setEditingRotateSize] = useState(false);
    const [heartbeatInput, setHeartbeatInput] = useState(() => String(config.heartbeatMinutes));
    const [rotateSizeInput, setRotateSizeInput] = useState(() => String(config.rotateMaxMb));
    const [validationError, setValidationError] = useState<string | null>(null);

    const updateConfig = (changes: Partial<UsageTrackerConfig>) => {
        onUpdate({
            ...settings,
            usageTracker: {
                ...config,
                ...changes
            }
        });
    };

    const handleSelect = (value: UsageTrackerValue | 'back') => {
        switch (value) {
            case 'back':
                onBack();
                break;
            case 'enabled':
                updateConfig({ enabled: !config.enabled });
                break;
            case 'logApiUsage':
                updateConfig({ logApiUsage: !config.logApiUsage });
                break;
            case 'heartbeatMinutes':
                setHeartbeatInput(String(config.heartbeatMinutes));
                setEditingHeartbeat(true);
                break;
            case 'rotateMaxMb':
                setRotateSizeInput(String(config.rotateMaxMb));
                setEditingRotateSize(true);
                break;
        }
    };

    useInput((input, key) => {
        if (editingHeartbeat) {
            if (key.return) {
                const error = validateHeartbeatMinutesInput(heartbeatInput);

                if (error) {
                    setValidationError(error);
                } else {
                    updateConfig({ heartbeatMinutes: parseInt(heartbeatInput, 10) });
                    setEditingHeartbeat(false);
                    setValidationError(null);
                }
            } else if (key.escape) {
                setHeartbeatInput(String(config.heartbeatMinutes));
                setEditingHeartbeat(false);
                setValidationError(null);
            } else if (key.backspace) {
                setHeartbeatInput(heartbeatInput.slice(0, -1));
                setValidationError(null);
            } else if (key.delete) {
                // No cursor position in simple input
            } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
                const newValue = heartbeatInput + input;
                if (newValue.length <= 3) {
                    setHeartbeatInput(newValue);
                    setValidationError(null);
                }
            }
            return;
        }

        if (editingRotateSize) {
            if (key.return) {
                const error = validateRotateMaxMbInput(rotateSizeInput);

                if (error) {
                    setValidationError(error);
                } else {
                    updateConfig({ rotateMaxMb: parseInt(rotateSizeInput, 10) });
                    setEditingRotateSize(false);
                    setValidationError(null);
                }
            } else if (key.escape) {
                setRotateSizeInput(String(config.rotateMaxMb));
                setEditingRotateSize(false);
                setValidationError(null);
            } else if (key.backspace) {
                setRotateSizeInput(rotateSizeInput.slice(0, -1));
                setValidationError(null);
            } else if (key.delete) {
                // No cursor position in simple input
            } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
                const newValue = rotateSizeInput + input;
                if (newValue.length <= 3) {
                    setRotateSizeInput(newValue);
                    setValidationError(null);
                }
            }
            return;
        }

        if (key.escape) {
            onBack();
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Usage Tracker</Text>
            <Text color='white'>Record rate limit usage to a local log file for later analysis</Text>

            {editingHeartbeat ? (
                <Box marginTop={1} flexDirection='column'>
                    <Text>
                        Enter heartbeat interval in minutes (1-120):
                        {' '}
                        {heartbeatInput}
                    </Text>
                    {validationError ? (
                        <Text color='red'>{validationError}</Text>
                    ) : (
                        <Text dimColor>Press Enter to confirm, ESC to cancel.</Text>
                    )}
                </Box>
            ) : editingRotateSize ? (
                <Box marginTop={1} flexDirection='column'>
                    <Text>
                        Enter maximum log size in MB (1-100):
                        {' '}
                        {rotateSizeInput}
                    </Text>
                    {validationError ? (
                        <Text color='red'>{validationError}</Text>
                    ) : (
                        <Text dimColor>Press Enter to confirm, ESC to cancel.</Text>
                    )}
                </Box>
            ) : (
                <>
                    <List
                        marginTop={1}
                        items={buildUsageTrackerItems(config)}
                        onSelect={handleSelect}
                        showBackButton={true}
                    />
                    <Box marginTop={1} flexDirection='column'>
                        <Text dimColor wrap='wrap'>
                            Log file:
                            {' '}
                            {getResolvedLogPath(config)}
                        </Text>
                        {shouldWarnAboutApiPolling(config, settings.lines) && (
                            <Text color='yellow' wrap='wrap'>{API_POLLING_WARNING}</Text>
                        )}
                    </Box>
                </>
            )}
        </Box>
    );
};
