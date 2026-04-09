import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { Settings } from '../../types/Settings';
import { shouldInsertInput } from '../../utils/input-guards';
import {
    compareSemver,
    fetchChangelog,
    generateTips,
    getTipsDir,
    listValidTipFiles,
    readLastVersion,
    readTipFile,
    readTipIndex,
    writeTipFile,
    writeTipIndex
} from '../../utils/tips';

import { ConfirmDialog } from './ConfirmDialog';
import {
    List,
    type ListEntry
} from './List';

type TipsMode = 'menu' | 'editNumber' | 'browseTips' | 'confirmClear' | 'generating';

interface GenerateState {
    status: 'running' | 'success' | 'error';
    message: string;
}

function getClaudeVersion(): string | null {
    const lastVersion = readLastVersion();
    if (lastVersion) {
        return lastVersion.version;
    }
    try {
        const output = execFileSync('claude', ['--version'], {
            encoding: 'utf-8',
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const match = output.trim().match(/(\d+\.\d+\.\d+)/);
        return match ? match[1]! : null;
    } catch {
        return null;
    }
}

interface FieldConfig {
    label: string;
    min: number;
    settingsKey: 'rotateEvery' | 'expiryDays' | 'maxTipLength';
}

const FIELD_CONFIGS: Record<string, FieldConfig> = {
    rotateEvery: { label: 'Rotate Every', min: 1, settingsKey: 'rotateEvery' },
    expiryDays: { label: 'Expiry Days', min: 1, settingsKey: 'expiryDays' },
    maxTipLength: { label: 'Max Tip Length', min: 10, settingsKey: 'maxTipLength' }
};

export interface TipsMenuProps {
    settings: Settings;
    onUpdate: (settings: Settings) => void;
    onBack: () => void;
}

export const TipsMenu: React.FC<TipsMenuProps> = ({
    settings,
    onUpdate,
    onBack
}) => {
    const [mode, setMode] = useState<TipsMode>('menu');
    const [editingField, setEditingField] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [generateState, setGenerateState] = useState<GenerateState | null>(null);

    const [tipFiles] = useState(() => listValidTipFiles(settings));
    const totalTips = tipFiles.reduce((sum, f) => sum + f.tips.length, 0);
    const versionCount = tipFiles.length;

    useInput((input, key) => {
        if (mode === 'editNumber') {
            if (key.return) {
                const parsed = parseInt(inputValue, 10);
                const config = FIELD_CONFIGS[editingField!]!;

                if (isNaN(parsed) || parsed < config.min) {
                    setValidationError(`Value must be at least ${config.min}`);
                    return;
                }

                onUpdate({
                    ...settings,
                    tips: { ...settings.tips, [config.settingsKey]: parsed }
                });
                setEditingField(null);
                setMode('menu');
                setValidationError(null);
            } else if (key.escape) {
                setEditingField(null);
                setMode('menu');
                setValidationError(null);
            } else if (key.backspace) {
                setInputValue(inputValue.slice(0, -1));
                setValidationError(null);
            } else if (key.delete) {
                // No-op for simple number input
            } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
                setInputValue(inputValue + input);
                setValidationError(null);
            }
            return;
        }

        if (mode === 'browseTips' || mode === 'generating') {
            if (key.escape && (mode !== 'generating' || generateState?.status !== 'running')) {
                setMode('menu');
                setGenerateState(null);
            }
            return;
        }
    });

    const handleSelect = (value: string | 'back') => {
        if (value === 'back') {
            onBack();
            return;
        }

        if (value === 'toggle') {
            onUpdate({
                ...settings,
                tips: { ...settings.tips, enabled: !settings.tips.enabled }
            });
            return;
        }

        if (value in FIELD_CONFIGS) {
            setEditingField(value);
            setInputValue(String(settings.tips[FIELD_CONFIGS[value]!.settingsKey]));
            setValidationError(null);
            setMode('editNumber');
            return;
        }

        if (value === 'browse') {
            setMode('browseTips');
            return;
        }

        if (value === 'rotate') {
            const index = readTipIndex();
            writeTipIndex({
                index: index.index + 1,
                renderCount: 0,
                updatedAt: new Date().toISOString()
            });
            return;
        }

        if (value === 'generate') {
            const version = getClaudeVersion();
            if (!version) {
                setGenerateState({ status: 'error', message: 'Could not determine Claude Code version' });
                setMode('generating');
                return;
            }
            const existing = readTipFile(version, settings);
            if (existing) {
                setGenerateState({ status: 'success', message: `Tips already exist for v${version} (${existing.tips.length} tips)` });
                setMode('generating');
                return;
            }
            setGenerateState({ status: 'running', message: `Fetching changelog and generating tips for v${version}...` });
            setMode('generating');
            void (async () => {
                const changelog = await fetchChangelog(version);
                if (!changelog) {
                    setGenerateState({ status: 'error', message: `No changelog found for v${version}` });
                    return;
                }
                const tips = await generateTips(changelog, settings);
                if (tips.length === 0) {
                    setGenerateState({ status: 'error', message: 'No tips generated from changelog' });
                    return;
                }
                writeTipFile({
                    version,
                    previousVersion: '',
                    generatedAt: new Date().toISOString(),
                    tips,
                    changelog
                }, settings);
                setGenerateState({ status: 'success', message: `Generated ${tips.length} tips for v${version}` });
            })().catch(() => {
                setGenerateState({ status: 'error', message: 'Failed to generate tips' });
            });
            return;
        }

        if (value === 'clear') {
            setMode('confirmClear');
        }
    };

    const handleConfirmClear = () => {
        const dir = getTipsDir(settings);
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter(f => f.startsWith('tips_') && f.endsWith('.json'));
            for (const file of files) {
                fs.unlinkSync(path.join(dir, file));
            }
        }
        writeTipIndex({ index: 0, renderCount: 0, updatedAt: new Date().toISOString() });
        setMode('menu');
    };

    if (mode === 'editNumber' && editingField) {
        const config = FIELD_CONFIGS[editingField]!;
        return (
            <Box flexDirection='column'>
                <Text bold>💡 Tips Menu</Text>
                <Box marginTop={1} flexDirection='column'>
                    <Text>
                        Enter {config.label} (min {config.min}):
                        {' '}
                        {inputValue}
                    </Text>
                    {validationError ? (
                        <Text color='red'>{validationError}</Text>
                    ) : (
                        <Text dimColor>Press Enter to confirm, ESC to cancel</Text>
                    )}
                </Box>
            </Box>
        );
    }

    if (mode === 'browseTips') {
        const sorted = [...tipFiles].sort((a, b) => compareSemver(b.version, a.version));

        return (
            <Box flexDirection='column'>
                <Text bold>💡 Browse Tips</Text>
                <Text dimColor>Press ESC to go back</Text>
                <Box marginTop={1} flexDirection='column'>
                    {sorted.length === 0 ? (
                        <Text dimColor>(no tips found)</Text>
                    ) : (
                        sorted.map((file) => {
                            const daysAgo = Math.floor(
                                (Date.now() - new Date(file.generatedAt).getTime()) / (24 * 60 * 60 * 1000)
                            );
                            const ageLabel = daysAgo === 0 ? 'today' : `${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`;
                            return (
                                <Box key={file.version} flexDirection='column' marginBottom={1}>
                                    <Text bold>
                                        v{file.version}
                                        {' '}
                                        <Text dimColor>({ageLabel}) — {file.tips.length} tip{file.tips.length === 1 ? '' : 's'}</Text>
                                    </Text>
                                    {file.tips.map((tip, i) => (
                                        <Text key={i}>  {i + 1}. {tip}</Text>
                                    ))}
                                </Box>
                            );
                        })
                    )}
                </Box>
            </Box>
        );
    }

    if (mode === 'generating' && generateState) {
        return (
            <Box flexDirection='column'>
                <Text bold>💡 Tips Menu</Text>
                <Box marginTop={1} flexDirection='column'>
                    <Text color={
                        generateState.status === 'running' ? 'yellow'
                            : generateState.status === 'success' ? 'green'
                                : 'red'
                    }>
                        {generateState.status === 'running' ? '⏳ ' : generateState.status === 'success' ? '✓ ' : '✗ '}
                        {generateState.message}
                    </Text>
                    {generateState.status !== 'running' && (
                        <Text dimColor>Press ESC to go back</Text>
                    )}
                </Box>
            </Box>
        );
    }

    if (mode === 'confirmClear') {
        return (
            <Box flexDirection='column'>
                <Text bold>💡 Tips Menu</Text>
                <Box marginTop={1} flexDirection='column'>
                    <Text color='yellow'>⚠ This will delete all tip files and reset rotation. Continue?</Text>
                    <Box marginTop={1}>
                        <ConfirmDialog
                            inline={true}
                            onConfirm={handleConfirmClear}
                            onCancel={() => { setMode('menu'); }}
                        />
                    </Box>
                </Box>
            </Box>
        );
    }

    const menuItems: (ListEntry<string> | '-')[] = [
        {
            value: 'toggle',
            label: settings.tips.enabled ? 'Tips: ✓ Enabled' : 'Tips: ✗ Disabled',
            description: 'Enable or disable tip rotation'
        },
        {
            value: 'rotateEvery',
            label: `Rotate Every: ${settings.tips.rotateEvery} renders`,
            description: 'Number of status line renders before showing the next tip'
        },
        {
            value: 'expiryDays',
            label: `Expiry Days: ${settings.tips.expiryDays}`,
            description: 'Days before tip files are automatically cleaned up'
        },
        {
            value: 'maxTipLength',
            label: `Max Tip Length: ${settings.tips.maxTipLength} chars`,
            description: 'Maximum character length for generated tips'
        },
        '-',
        {
            value: 'browse',
            label: totalTips > 0
                ? `📖 Browse Tips (${totalTips} tip${totalTips === 1 ? '' : 's'}, ${versionCount} version${versionCount === 1 ? '' : 's'})`
                : '📖 Browse Tips (none)',
            description: 'View all stored tips grouped by version'
        },
        {
            value: 'generate',
            label: '🔧 Generate Tips',
            description: 'Fetch changelog and generate tips for the current Claude Code version'
        },
        {
            value: 'rotate',
            label: '🔄 Rotate Now',
            description: 'Advance to the next tip immediately'
        },
        {
            value: 'clear',
            label: '🗑  Clear All Tips',
            description: 'Delete all tip files and reset rotation'
        }
    ];

    return (
        <Box flexDirection='column'>
            <Text bold>💡 Tips Menu</Text>
            <List
                marginTop={1}
                items={menuItems}
                onSelect={(value, _index) => { handleSelect(value); }}
                showBackButton={true}
            />
        </Box>
    );
};
