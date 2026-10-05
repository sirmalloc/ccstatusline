import * as fs from 'fs';
import {
    Box,
    Text
} from 'ink';
import type {
    FileEntry,
    FilePickerProps
} from 'ink-file-picker';
import * as os from 'os';
import * as path from 'path';
import React from 'react';

// Leave room for title, subtitle, picker header/separators/footer, "more above/below" lines,
// the path/name row and our hint lines so the title never scrolls off small terminals.
// Computed once at module load; does not follow terminal resizes (acceptable for a short-lived dialog).
export const PICKER_HEIGHT = Math.max(5, Math.min(12, (process.stdout.rows || 24) - 16));

// Module-level so the reference is stable: FilePicker re-syncs config when `filter` changes.
// Case-insensitive (.JSON too). Directories bypass `filter` per the library docs.
export const JSON_FILE_FILTER = (entry: FileEntry): boolean => entry.name.toLowerCase().endsWith('.json');

// Match the rest of the TUI (see List.tsx): green "▶  " marker on the focused row.
// Module-level so the object identity is stable. Icons are two spaces so rows align with the
// 1-column focus marker/blank (marker + 2 spaces = 3 columns, like List's "▶  ").
export const PICKER_THEME: FilePickerProps['theme'] = {
    styles: {
        headerPath: () => ({ bold: true }),
        entryRow: () => ({ flexDirection: 'row', gap: 0, paddingLeft: 0 }),
        entryName: ({ isFocused }) => ({ color: isFocused ? 'green' : undefined }),
        focusIndicator: () => ({ color: 'green' })
    },
    config: {
        directoryIcon: '  ',
        fileIcon: '  ',
        symlinkIcon: '  ',
        focusIndicator: '▶'
    }
};

export interface Hint {
    key: string;
    action: string;
}

// Mirrors the bracketed style of the library's footer so both lines read as one block.
export function HintBar({ hints }: { hints: Hint[] }): React.JSX.Element {
    return (
        <Box>
            {hints.map(hint => (
                <Box key={hint.key} marginRight={1}>
                    <Text bold dimColor>{`[${hint.key}]`}</Text>
                    <Text dimColor>{` ${hint.action}`}</Text>
                </Box>
            ))}
        </Box>
    );
}

// process.cwd() throws ENOENT if the launch directory was deleted.
export function safeCwd(): string {
    try {
        return process.cwd();
    } catch {
        return os.homedir();
    }
}

export function isDirectory(filePath: string): boolean {
    try {
        return fs.statSync(filePath).isDirectory();
    } catch {
        return false;
    }
}

export function withTrailingSep(dir: string): string {
    return dir.endsWith(path.sep) ? dir : dir + path.sep;
}
