import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';

export class CurrentWorkingDirWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows the current working directory'; }
    getDisplayName(): string { return 'Current Working Dir'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const segments = item.metadata?.segments ? parseInt(item.metadata.segments, 10) : undefined;
        const modifiers: string[] = [];

        if (segments && segments > 0) {
            modifiers.push(`segments: ${segments}`);
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            const segments = item.metadata?.segments ? parseInt(item.metadata.segments, 10) : undefined;
            let previewPath: string;
            if (segments && segments > 0) {
                if (segments === 1) {
                    previewPath = '.../project';
                } else {
                    previewPath = '.../example/project';
                }
            } else {
                previewPath = '/Users/example/project';
            }
            return item.rawValue ? previewPath : `cwd: ${previewPath}`;
        }

        const cwd = context.data?.cwd;
        if (!cwd) {
            return null;
        }

        const segments = item.metadata?.segments ? parseInt(item.metadata.segments, 10) : undefined;
        let displayPath = cwd;

        if (segments && segments > 0) {
            // Support both POSIX ('/') and Windows ('\\') separators; preserve original separator in output
            const useBackslash = cwd.includes('\\') && !cwd.includes('/');
            const outSep = useBackslash ? '\\' : '/';

            const pathParts = cwd.split(/[\\/]+/);
            // Remove empty strings from splitting (e.g., leading slash or UNC leading separators)
            const filteredParts = pathParts.filter(part => part !== '');

            if (filteredParts.length > segments) {
                // Take the last N segments and join with the detected separator
                const selectedSegments = filteredParts.slice(-segments);
                displayPath = '...' + outSep + selectedSegments.join(outSep);
            }
        }

        return item.rawValue ? displayPath : `cwd: ${displayPath}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 's', label: '(s)egments', action: 'edit-segments' }
        ];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <CurrentWorkingDirEditor {...props} />;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}

const CurrentWorkingDirEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const [segmentsInput, setSegmentsInput] = useState(widget.metadata?.segments ?? '');

    useInput((input, key) => {
        if (action === 'edit-segments') {
            if (key.return) {
                const segments = parseInt(segmentsInput, 10);
                if (!isNaN(segments) && segments > 0) {
                    onComplete({
                        ...widget,
                        metadata: {
                            ...widget.metadata,
                            segments: segments.toString()
                        }
                    });
                } else {
                    // Clear segments if blank or invalid
                    const { segments, ...restMetadata } = widget.metadata ?? {};
                    void segments; // Intentionally unused
                    onComplete({
                        ...widget,
                        metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
                    });
                }
            } else if (key.escape) {
                onCancel();
            } else if (key.backspace) {
                setSegmentsInput(segmentsInput.slice(0, -1));
            } else if (input && /\d/.test(input) && !key.ctrl) {
                setSegmentsInput(segmentsInput + input);
            }
        }
    });

    if (action === 'edit-segments') {
        return (
            <Box flexDirection='column'>
                <Box>
                    <Text>Enter number of segments to display (blank for full path): </Text>
                    <Text>{segmentsInput}</Text>
                    <Text backgroundColor='gray' color='black'>{' '}</Text>
                </Box>
                <Text dimColor>Press Enter to save, ESC to cancel</Text>
            </Box>
        );
    }

    return <Text>Unknown editor mode</Text>;
};