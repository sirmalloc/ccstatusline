import {
    Box,
    Static,
    Text
} from 'ink';
import React from 'react';

import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import type { ImportValidationResult } from '../../utils/config';

import {
    List,
    type ListEntry
} from './List';

type ValidImportResult = Extract<ImportValidationResult, { status: 'valid' }>;

interface ImportPreviewDialogProps {
    validation: ValidImportResult;
    currentSettings: Settings;
    onApply: (mode: 'replace' | 'merge') => void;
    onCancel: () => void;
}

type ImportMode = 'replace' | 'merge' | 'cancel';

const EXCLUDED_KEYS = new Set(['version', 'installation', 'updatemessage']);

interface DiffEntry {
    path: string;
    current: unknown;
    imported: unknown;
}

function formatScalar(value: unknown): string {
    if (value === null || value === undefined) {
        return 'none';
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'string') {
        return value || '(empty)';
    }
    return JSON.stringify(value);
}

function diffObject(current: Record<string, unknown>, imported: Record<string, unknown>, prefix: string): DiffEntry[] {
    const keys = new Set([...Object.keys(current), ...Object.keys(imported)]);
    const entries: DiffEntry[] = [];

    for (const key of keys) {
        const path = prefix ? `${prefix}.${key}` : key;
        const a = current[key];
        const b = imported[key];
        if (JSON.stringify(a) === JSON.stringify(b)) {
            continue;
        }

        if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
            entries.push(...diffObject(a as Record<string, unknown>, b as Record<string, unknown>, path));
        } else {
            entries.push({ path, current: a, imported: b });
        }
    }

    return entries;
}

function diffLines(currentLines: WidgetItem[][], importedLines: WidgetItem[][]): DiffEntry[] {
    const entries: DiffEntry[] = [];
    const lineCount = Math.max(currentLines.length, importedLines.length);

    for (let li = 0; li < lineCount; li++) {
        const curLine = currentLines[li] ?? [];
        const impLine = importedLines[li] ?? [];

        const widgetCount = Math.max(curLine.length, impLine.length);
        for (let wi = 0; wi < widgetCount; wi++) {
            const curWidget = curLine[wi];
            const impWidget = impLine[wi];

            if (JSON.stringify(curWidget) === JSON.stringify(impWidget)) {
                continue;
            }

            if (!curWidget) {
                const addedType = impWidget?.type ?? 'unknown';
                entries.push({ path: `line ${li + 1} +${addedType}`, current: undefined, imported: '[added]' });
                continue;
            }

            if (!impWidget) {
                entries.push({ path: `line ${li + 1} -${curWidget.type}`, current: '[removed]', imported: undefined });
                continue;
            }

            const label = `${curWidget.type} (line ${li + 1})`;
            const widgetKeys = new Set([...Object.keys(curWidget), ...Object.keys(impWidget)]) as Set<keyof WidgetItem>;
            for (const key of widgetKeys) {
                if (key === 'id') {
                    continue;
                }
                const a = curWidget[key];
                const b = impWidget[key];
                if (JSON.stringify(a) !== JSON.stringify(b)) {
                    entries.push({ path: `${label} ${key}`, current: a, imported: b });
                }
            }
        }
    }

    return entries;
}

export function ImportPreviewDialog({
    validation,
    currentSettings,
    onApply,
    onCancel
}: ImportPreviewDialogProps): React.JSX.Element {
    const topLevelKeys = (Object.keys(currentSettings) as (keyof Settings)[])
        .filter(k => !EXCLUDED_KEYS.has(k));

    const items: ListEntry<ImportMode>[] = [
        { label: 'Replace All', value: 'replace', description: 'Overwrite all settings with the imported config' },
        { label: 'Merge', value: 'merge', description: 'Overlay imported settings on top of current settings' },
        '-' as unknown as ListEntry<ImportMode>,
        { label: 'Cancel', value: 'cancel' }
    ];

    function handleSelect(value: ImportMode | 'back'): void {
        if (value === 'cancel' || value === 'back') {
            onCancel();
        } else {
            onApply(value);
        }
    }

    const diffRows: React.JSX.Element[] = [];

    for (const key of topLevelKeys) {
        const current = currentSettings[key];
        const imported = validation.data[key];
        const changed = JSON.stringify(current) !== JSON.stringify(imported);

        if (!changed) {
            diffRows.push(
                <Box key={key}>
                    <Text dimColor>{`  ${key}: ${formatScalar(current)}`}</Text>
                </Box>
            );
            continue;
        }

        if (key === 'lines') {
            const entries = diffLines(current as WidgetItem[][], imported as WidgetItem[][]);
            diffRows.push(
                <Box key={key} flexDirection='column'>
                    <Text>{`  ${key}:`}</Text>
                    {entries.map((e, i) => (
                        <Box key={i} marginLeft={4}>
                            <Text>{`${e.path}: `}</Text>
                            <Text color='red'>{formatScalar(e.current)}</Text>
                            <Text>{' → '}</Text>
                            <Text color='green'>{formatScalar(e.imported)}</Text>
                        </Box>
                    ))}
                </Box>
            );
            continue;
        }

        if (current && imported && typeof current === 'object' && typeof imported === 'object' && !Array.isArray(current)) {
            const entries = diffObject(
                current,
                imported as Record<string, unknown>,
                key
            );
            diffRows.push(
                <Box key={key} flexDirection='column'>
                    <Text>{`  ${key}:`}</Text>
                    {entries.map((e, i) => (
                        <Box key={i} marginLeft={4}>
                            <Text>{`${e.path}: `}</Text>
                            <Text color='red'>{formatScalar(e.current)}</Text>
                            <Text>{' → '}</Text>
                            <Text color='green'>{formatScalar(e.imported)}</Text>
                        </Box>
                    ))}
                </Box>
            );
            continue;
        }

        diffRows.push(
            <Box key={key}>
                <Text>{`  ${key}: `}</Text>
                <Text color='red'>{formatScalar(current)}</Text>
                <Text>{' → '}</Text>
                <Text color='green'>{formatScalar(imported)}</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection='column'>
            <Text bold>Import Preview</Text>
            <Text dimColor>Changes that will be applied:</Text>
            <Static items={diffRows}>
                {(row, i) => <Box key={i}>{row}</Box>}
            </Static>
            <List items={items} onSelect={handleSelect} />
        </Box>
    );
}
