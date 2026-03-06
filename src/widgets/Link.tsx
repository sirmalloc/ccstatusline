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

function isValidHttpUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function toEditorMetadata(widget: WidgetItem): { url: string; text: string } {
    const url = widget.metadata?.url ?? '';
    const text = widget.metadata?.text ?? '';
    return { url, text };
}

function buildMetadata(widget: WidgetItem, urlValue: string, textValue: string): WidgetItem {
    const metadata = { ...(widget.metadata ?? {}) };
    const trimmedUrl = urlValue.trim();
    const trimmedText = textValue.trim();

    if (trimmedUrl.length > 0) {
        metadata.url = trimmedUrl;
    } else {
        delete metadata.url;
    }

    if (trimmedText.length > 0) {
        metadata.text = trimmedText;
    } else {
        delete metadata.text;
    }

    if (Object.keys(metadata).length === 0) {
        const { metadata, ...rest } = widget;
        void metadata; // Intentionally unused
        return rest;
    }

    return {
        ...widget,
        metadata
    };
}

function renderOsc8Link(url: string, text: string): string {
    return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

function getLinkLabel(item: WidgetItem): { url: string; label: string } {
    const url = item.metadata?.url?.trim() ?? '';
    const metadataText = item.metadata?.text?.trim();
    const label = metadataText && metadataText.length > 0
        ? metadataText
        : (url.length > 0 ? url : 'no url');

    return { url, label };
}

function withEmojiPrefix(label: string, rawValue?: boolean): string {
    return rawValue ? label : `🔗 ${label}`;
}

export class LinkWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Displays a clickable terminal hyperlink using OSC 8'; }
    getDisplayName(): string { return 'Link'; }
    getCategory(): string { return 'Custom'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const { url, label } = getLinkLabel(item);
        const metadataText = item.metadata?.text?.trim();
        const hasCustomText = Boolean(metadataText && metadataText.length > 0);
        const text = withEmojiPrefix(label, item.rawValue);
        const shortUrl = hasCustomText && url.length > 0
            ? (url.length > 28 ? `${url.substring(0, 25)}...` : url)
            : null;

        return {
            displayText: `${this.getDisplayName()} (${text})`,
            modifierText: shortUrl ? `(${shortUrl})` : undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        void settings;
        void context;

        const { url, label } = getLinkLabel(item);
        const displayText = withEmojiPrefix(label, item.rawValue);

        if (!url || !isValidHttpUrl(url)) {
            return displayText;
        }

        return renderOsc8Link(url, displayText);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'u', label: '(u)rl', action: 'edit-url' },
            { key: 'e', label: '(e)dit text', action: 'edit-text' }
        ];
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <LinkEditor {...props} />;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean {
        void item;
        return true;
    }
}

type LinkEditorMode = 'url' | 'text';

function getEditorMode(action?: string): LinkEditorMode {
    if (action === 'edit-url') {
        return 'url';
    }
    return 'text';
}

const LinkEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const initial = toEditorMetadata(widget);
    const mode = getEditorMode(action);

    const [urlInput, setUrlInput] = useState(initial.url);
    const [urlCursorPos, setUrlCursorPos] = useState(initial.url.length);
    const [textInput, setTextInput] = useState(initial.text);
    const [textCursorPos, setTextCursorPos] = useState(initial.text.length);

    const isUrlMode = mode === 'url';
    const activeValue = isUrlMode ? urlInput : textInput;
    const activeCursor = isUrlMode ? urlCursorPos : textCursorPos;

    const updateActiveValue = (value: string, cursor: number) => {
        if (isUrlMode) {
            setUrlInput(value);
            setUrlCursorPos(cursor);
        } else {
            setTextInput(value);
            setTextCursorPos(cursor);
        }
    };

    useInput((input, key) => {
        if (key.return) {
            onComplete(buildMetadata(widget, urlInput, textInput));
        } else if (key.escape) {
            onCancel();
        } else if (key.leftArrow) {
            updateActiveValue(activeValue, Math.max(0, activeCursor - 1));
        } else if (key.rightArrow) {
            updateActiveValue(activeValue, Math.min(activeValue.length, activeCursor + 1));
        } else if (key.backspace) {
            if (activeCursor > 0) {
                const value = activeValue.slice(0, activeCursor - 1) + activeValue.slice(activeCursor);
                updateActiveValue(value, activeCursor - 1);
            }
        } else if (key.delete) {
            if (activeCursor < activeValue.length) {
                const value = activeValue.slice(0, activeCursor) + activeValue.slice(activeCursor + 1);
                updateActiveValue(value, activeCursor);
            }
        } else if (shouldInsertInput(input, key)) {
            const value = activeValue.slice(0, activeCursor) + input + activeValue.slice(activeCursor);
            updateActiveValue(value, activeCursor + input.length);
        }
    });

    const showInvalidUrlWarning = isUrlMode && urlInput.trim().length > 0 && !isValidHttpUrl(urlInput.trim());
    const prompt = isUrlMode ? 'Enter URL (http/https): ' : 'Enter link text (blank uses URL): ';

    return (
        <Box flexDirection='column'>
            <Text>
                {prompt}
                {activeValue.slice(0, activeCursor)}
                <Text backgroundColor='gray' color='black'>{activeValue[activeCursor] ?? ' '}</Text>
                {activeValue.slice(activeCursor + 1)}
            </Text>
            {isUrlMode ? (
                <Text dimColor>
                    Current text:
                    {' '}
                    {textInput.trim() || '(uses URL)'}
                </Text>
            ) : (
                <Text dimColor>
                    Current URL:
                    {' '}
                    {urlInput.trim() || '(none)'}
                </Text>
            )}
            {showInvalidUrlWarning && (
                <Text color='yellow'>URL must begin with http:// or https://</Text>
            )}
            <Text dimColor>←→ move cursor, Enter save, ESC cancel</Text>
        </Box>
    );
};