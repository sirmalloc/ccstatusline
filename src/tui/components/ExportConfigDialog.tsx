import {
    Box,
    Text,
    useInput
} from 'ink';
import { FilePicker } from 'ink-file-picker';
import * as os from 'os';
import * as path from 'path';
import React, {
    useRef,
    useState
} from 'react';

import { normalizeUserPath } from '../../utils/config';
import {
    DEFAULT_EXPORT_FILE_NAME,
    validateExportFileName,
    withJsonExtension
} from '../../utils/export-target';
import { shouldInsertInput } from '../../utils/input-guards';

import {
    HintBar,
    JSON_FILE_FILTER,
    PICKER_HEIGHT,
    PICKER_THEME,
    isDirectory,
    withTrailingSep,
    type Hint
} from './file-picker-common';

interface ExportConfigDialogProps {
    onExport: (filePath: string) => void;
    onCancel: () => void;
    /** Starting folder. Defaults to the home directory. */
    initialDir?: string;
    /** Starting file name. Defaults to ccstatusline-config.json. */
    initialFileName?: string;
}

type DialogMode = 'browse' | 'path';
type BrowseFocus = 'list' | 'name';

function getHintRows(mode: DialogMode, focus: BrowseFocus, showHidden: boolean): Hint[][] {
    if (mode === 'path') {
        return [[
            { key: 'Enter', action: 'confirm (a folder opens it)' },
            { key: 'Esc', action: 'back to browser' }
        ]];
    }
    if (focus === 'name') {
        return [
            [
                { key: 'Enter', action: 'save' },
                { key: 'Tab', action: 'back to list' },
                { key: 'Ctrl+S', action: 'save here' }
            ],
            [
                { key: 'Ctrl+T', action: 'type path' },
                { key: 'Esc', action: 'back to list' }
            ]
        ];
    }
    return [
        [
            { key: 'Enter', action: 'open/save' },
            { key: 'Tab', action: 'edit name' },
            { key: 'Ctrl+S', action: 'save here' }
        ],
        [
            { key: 'Ctrl+T', action: 'type path' },
            { key: 'Ctrl+O', action: `${showHidden ? 'hide' : 'show'} hidden` },
            { key: 'Esc', action: 'cancel' }
        ]
    ];
}

export function ExportConfigDialog({
    onExport,
    onCancel,
    initialDir,
    initialFileName
}: ExportConfigDialogProps): React.JSX.Element {
    const [mode, setMode] = useState<DialogMode>('browse');
    const [focus, setFocus] = useState<BrowseFocus>('list');
    const [startDir, setStartDir] = useState(() => initialDir ?? os.homedir());
    const [currentDir, setCurrentDir] = useState(startDir);
    const [pickerKey, setPickerKey] = useState(0);
    const [showHidden, setShowHidden] = useState(false);
    const [fileName, setFileName] = useState(initialFileName ?? DEFAULT_EXPORT_FILE_NAME);
    const [inputValue, setInputValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    // App's handleExportConfig is async; guard against a second Enter/Ctrl+S firing it twice.
    // App remounts this dialog when it returns here after a declined confirm, which resets the guard.
    const submittedRef = useRef(false);

    const submit = (filePath: string) => {
        if (submittedRef.current) {
            return;
        }
        submittedRef.current = true;
        onExport(filePath);
    };

    const saveHere = () => {
        const result = validateExportFileName(fileName);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        submit(path.join(currentDir, result.fileName));
    };

    const openDirectory = (dir: string) => {
        setStartDir(dir);
        setCurrentDir(dir);
        setPickerKey(k => k + 1);
        setFocus('list');
        setMode('browse');
    };

    useInput((input, key) => {
        if (mode === 'path') {
            if (key.return) {
                const resolved = normalizeUserPath(inputValue, currentDir);
                if (isDirectory(resolved)) {
                    openDirectory(resolved);
                } else {
                    submit(path.join(path.dirname(resolved), withJsonExtension(path.basename(resolved))));
                }
            } else if (key.escape) {
                setMode('browse');
            } else if (key.backspace) {
                // Functional updates: pasted text can arrive as several input events in one tick.
                setInputValue(v => v.slice(0, -1));
            } else if (shouldInsertInput(input, key)) {
                setInputValue(v => v + input);
            }
            return;
        }

        // Browse mode. FilePicker ignores ctrl combos and Tab (Ink gives Tab input === ''),
        // so none of these collide with its type-ahead filter.
        if (key.ctrl && input === 's') {
            saveHere();
            return;
        }
        if (key.ctrl && input === 't') {
            setInputValue(withTrailingSep(currentDir) + fileName);
            setError(null);
            setMode('path');
            return;
        }
        if (key.ctrl && input === 'o') {
            setShowHidden(prev => !prev);
            return;
        }
        if (key.tab) {
            setFocus(f => (f === 'list' ? 'name' : 'list'));
            return;
        }

        if (focus === 'name') {
            // The picker is disabled while the name field has focus, so these keys are ours alone.
            if (key.return) {
                saveHere();
            } else if (key.escape) {
                setFocus('list');
            } else if (key.backspace) {
                setFileName(v => v.slice(0, -1));
                setError(null);
            } else if (shouldInsertInput(input, key)) {
                setFileName(v => v + input);
                setError(null);
            }
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Export Config</Text>
            <Text dimColor>Choose a folder and file name:</Text>
            <Box marginTop={1} flexDirection='column'>
                <FilePicker
                    key={pickerKey}
                    initialPath={startDir}
                    filter={JSON_FILE_FILTER}
                    fileTypes='files'
                    showHidden={showHidden}
                    maxHeight={PICKER_HEIGHT}
                    theme={PICKER_THEME}
                    isDisabled={mode === 'path' || focus === 'name'}
                    onDirectoryChange={setCurrentDir}
                    onSelect={([selected]) => {
                        // Enter on an existing .json file targets it; App asks before overwriting.
                        if (selected) {
                            submit(selected);
                        }
                    }}
                    onCancel={onCancel}
                />
            </Box>
            {mode === 'path'
                ? (
                    <Box marginTop={1}>
                        <Text>Path: </Text>
                        <Text>{inputValue}</Text>
                        <Text inverse> </Text>
                    </Box>
                )
                : (
                    <Box marginTop={1}>
                        <Text bold={focus === 'name'}>File name: </Text>
                        <Text>{fileName}</Text>
                        {focus === 'name' && <Text inverse> </Text>}
                    </Box>
                )}
            {error && <Text color='red'>{error}</Text>}
            {getHintRows(mode, focus, showHidden).map(hints => (
                <HintBar key={hints.map(h => h.key).join('+')} hints={hints} />
            ))}
        </Box>
    );
}
