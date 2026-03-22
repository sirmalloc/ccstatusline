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
import { shouldInsertInput } from '../utils/input-guards';

export class CustomSymbolWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Displays a custom symbol or emoji (single character)'; }
    getDisplayName(): string { return 'Custom Symbol'; }
    getCategory(): string { return 'Custom'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const symbol = item.customSymbol ?? '?';
        return { displayText: `${this.getDisplayName()} (${symbol})` };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return item.customSymbol ?? '';
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [{
            key: 'e',
            label: '(e)dit symbol',
            action: 'edit-symbol'
        }];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <CustomSymbolEditor {...props} />;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}

const CustomSymbolEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel }) => {
    const [symbol, setSymbol] = useState(widget.customSymbol ?? '');

    // Helper to get grapheme segments if Intl.Segmenter is available
    const getFirstGrapheme = (str: string): string => {
        if (str.length === 0) {
            return '';
        }

        if ('Segmenter' in Intl) {
            const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
            const segments = Array.from(segmenter.segment(str));
            return segments[0]?.segment ?? '';
        }

        // Fallback: just take first character
        return Array.from(str)[0] ?? '';
    };

    useInput((input, key) => {
        if (key.return) {
            onComplete({ ...widget, customSymbol: symbol });
        } else if (key.escape) {
            onCancel();
        } else if (key.backspace || key.delete) {
            setSymbol('');
        } else if (shouldInsertInput(input, key)) {
            // Take only the first grapheme (handles multi-byte emojis correctly)
            const firstGrapheme = getFirstGrapheme(input);
            setSymbol(firstGrapheme);
        }
    });

    return (
        <Box flexDirection='column'>
            <Text>
                Enter custom symbol:
                {' '}
                {symbol ? (
                    <Text inverse>{symbol}</Text>
                ) : (
                    <Text inverse dimColor>(empty)</Text>
                )}
            </Text>
            <Text dimColor>Type any character or emoji, Backspace clear, Enter save, ESC cancel</Text>
        </Box>
    );
};