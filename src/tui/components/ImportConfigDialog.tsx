import {
    Box,
    Text,
    useInput
} from 'ink';
import { FilePicker } from 'ink-file-picker';
import React, {
    useRef,
    useState
} from 'react';

import { normalizeUserPath } from '../../utils/config';
import { shouldInsertInput } from '../../utils/input-guards';

import {
    HintBar,
    JSON_FILE_FILTER,
    PICKER_HEIGHT,
    PICKER_THEME,
    isDirectory,
    safeCwd,
    withTrailingSep
} from './file-picker-common';

interface ImportConfigDialogProps {
    onFileChosen: (filePath: string) => void;
    onCancel: () => void;
    /** Overrides the starting directory (used by tests). */
    initialDir?: string;
}

type DialogMode = 'browse' | 'path';

export function ImportConfigDialog({ onFileChosen, onCancel, initialDir }: ImportConfigDialogProps): React.JSX.Element {
    const [mode, setMode] = useState<DialogMode>('browse');
    const [startDir, setStartDir] = useState(() => initialDir ?? safeCwd());
    const [currentDir, setCurrentDir] = useState(startDir);
    const [pickerKey, setPickerKey] = useState(0);
    const [showHidden, setShowHidden] = useState(false);
    const [inputValue, setInputValue] = useState('');
    // App's handleImportFileChosen is async; guard against a second Enter firing it twice.
    const submittedRef = useRef(false);

    const choose = (filePath: string) => {
        if (submittedRef.current) {
            return;
        }
        submittedRef.current = true;
        onFileChosen(filePath);
    };

    const openDirectory = (dir: string) => {
        setStartDir(dir);
        setCurrentDir(dir);
        setPickerKey(k => k + 1);
        setMode('browse');
    };

    useInput((input, key) => {
        if (mode === 'browse') {
            // FilePicker ignores ctrl combos, so these never collide with its filter.
            if (key.ctrl && input === 't') {
                setInputValue(withTrailingSep(currentDir));
                setMode('path');
            } else if (key.ctrl && input === 'o') {
                setShowHidden(prev => !prev);
            }
            return;
        }

        if (key.return) {
            const resolved = normalizeUserPath(inputValue, currentDir);
            if (isDirectory(resolved)) {
                openDirectory(resolved);
            } else {
                choose(resolved);
            }
        } else if (key.escape) {
            setMode('browse');
        } else if (key.backspace) {
            // Functional updates: pasted text can arrive as several input events in one tick.
            setInputValue(v => v.slice(0, -1));
        } else if (shouldInsertInput(input, key)) {
            setInputValue(v => v + input);
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>Import Config</Text>
            <Text dimColor>Select a configuration file to import:</Text>
            <Box marginTop={1} flexDirection='column'>
                <FilePicker
                    key={pickerKey}
                    initialPath={startDir}
                    filter={JSON_FILE_FILTER}
                    fileTypes='files'
                    showHidden={showHidden}
                    maxHeight={PICKER_HEIGHT}
                    theme={PICKER_THEME}
                    isDisabled={mode === 'path'}
                    onDirectoryChange={setCurrentDir}
                    onSelect={([selected]) => {
                        if (selected) {
                            choose(selected);
                        }
                    }}
                    onCancel={onCancel}
                />
            </Box>
            {mode === 'path' && (
                <Box marginTop={1}>
                    <Text>Path: </Text>
                    <Text>{inputValue}</Text>
                    <Text inverse> </Text>
                </Box>
            )}
            <HintBar
                hints={mode === 'browse'
                    ? [
                        { key: 'Ctrl+T', action: 'type path' },
                        { key: 'Ctrl+O', action: `${showHidden ? 'hide' : 'show'} hidden` }
                    ]
                    : [
                        { key: 'Enter', action: 'confirm (a folder opens it)' },
                        { key: 'Esc', action: 'back to browser' }
                    ]}
            />
        </Box>
    );
}
