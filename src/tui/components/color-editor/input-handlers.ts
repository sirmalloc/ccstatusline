import type { Settings } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import {
    getAvailableBackgroundColorsForUI,
    getAvailableColorsForUI
} from '../../../utils/colors';
import {
    shouldInsertInput,
    type InputKey
} from '../../../utils/input-guards';
import { getWidget } from '../../../utils/widgets';

export type { InputKey };

export interface ColorEditorState {
    editingBackground: boolean;
    hexInputMode: boolean;
    hexInput: string;
    ansi256InputMode: boolean;
    ansi256Input: string;
}

export interface HandleColorInputArgs {
    input: string;
    key: InputKey;
    widget: WidgetItem;
    settings: Settings;
    state: ColorEditorState;
    setState: (updater: (prev: ColorEditorState) => ColorEditorState) => void;
    onUpdate: (widget: WidgetItem) => void;
    onReset?: () => void;
}

function cycleColor(
    currentColor: string,
    colors: string[],
    direction: 'left' | 'right'
): string {
    if (colors.length === 0) {
        return currentColor;
    }

    let currentIndex = colors.indexOf(currentColor);
    if (currentIndex === -1) {
        currentIndex = 0;
    }

    const nextIndex = direction === 'right'
        ? (currentIndex + 1) % colors.length
        : (currentIndex - 1 + colors.length) % colors.length;

    return colors[nextIndex] ?? currentColor;
}

/**
 * Shared color input handler for ItemsEditor and rules-editor input handlers
 * Returns true if input was handled, false otherwise
 */
export function handleColorInput({
    input,
    key,
    widget,
    settings,
    state,
    setState,
    onUpdate,
    onReset
}: HandleColorInputArgs): boolean {
    const { editingBackground, hexInputMode, hexInput, ansi256InputMode, ansi256Input } = state;

    // Handle hex input mode
    if (hexInputMode) {
        if (key.upArrow || key.downArrow) {
            // Disable arrow keys in input mode
            return true;
        }

        if (key.escape) {
            setState(prev => ({ ...prev, hexInputMode: false, hexInput: '' }));
            return true;
        }

        if (key.return) {
            if (hexInput.length === 6) {
                const hexColor = `hex:${hexInput}`;
                const updatedWidget = editingBackground
                    ? { ...widget, backgroundColor: hexColor }
                    : { ...widget, color: hexColor };
                onUpdate(updatedWidget);
                setState(prev => ({ ...prev, hexInputMode: false, hexInput: '' }));
            }
            return true;
        }

        if (key.backspace || key.delete) {
            setState(prev => ({ ...prev, hexInput: prev.hexInput.slice(0, -1) }));
            return true;
        }

        if (shouldInsertInput(input, key) && hexInput.length < 6) {
            const upperInput = input.toUpperCase();
            if (/^[0-9A-F]$/.test(upperInput)) {
                setState(prev => ({ ...prev, hexInput: prev.hexInput + upperInput }));
            }
            return true;
        }

        return true;
    }

    // Handle ANSI256 input mode
    if (ansi256InputMode) {
        if (key.upArrow || key.downArrow) {
            // Disable arrow keys in input mode
            return true;
        }

        if (key.escape) {
            setState(prev => ({ ...prev, ansi256InputMode: false, ansi256Input: '' }));
            return true;
        }

        if (key.return) {
            const code = parseInt(ansi256Input, 10);
            if (!isNaN(code) && code >= 0 && code <= 255) {
                const ansiColor = `ansi256:${code}`;
                const updatedWidget = editingBackground
                    ? { ...widget, backgroundColor: ansiColor }
                    : { ...widget, color: ansiColor };
                onUpdate(updatedWidget);
                setState(prev => ({ ...prev, ansi256InputMode: false, ansi256Input: '' }));
            }
            return true;
        }

        if (key.backspace || key.delete) {
            setState(prev => ({ ...prev, ansi256Input: prev.ansi256Input.slice(0, -1) }));
            return true;
        }

        if (shouldInsertInput(input, key) && ansi256Input.length < 3) {
            if (/^[0-9]$/.test(input)) {
                const newInput = ansi256Input + input;
                const code = parseInt(newInput, 10);
                if (code <= 255) {
                    setState(prev => ({ ...prev, ansi256Input: newInput }));
                }
            }
            return true;
        }

        return true;
    }

    // Normal color editing mode
    if (input === 'h' && settings.colorLevel === 3) {
        setState(prev => ({ ...prev, hexInputMode: true, hexInput: '' }));
        return true;
    }

    if (input === 'a' && settings.colorLevel === 2) {
        setState(prev => ({ ...prev, ansi256InputMode: true, ansi256Input: '' }));
        return true;
    }

    if (input === 'f') {
        setState(prev => ({ ...prev, editingBackground: !prev.editingBackground }));
        return true;
    }

    if (input === 'b') {
        onUpdate({ ...widget, bold: !widget.bold });
        return true;
    }

    if (input === 'r') {
        if (onReset) {
            onReset();
        } else {
            // Default reset: remove color/backgroundColor/bold
            const { color, backgroundColor, bold, ...rest } = widget;
            void color;
            void backgroundColor;
            void bold;
            onUpdate(rest);
        }
        return true;
    }

    if (key.leftArrow || key.rightArrow) {
        const colors = editingBackground
            ? getAvailableBackgroundColorsForUI().map(c => c.value)
            : getAvailableColorsForUI().map(c => c.value);

        const widgetImpl = getWidget(widget.type);
        const defaultColor = widgetImpl?.getDefaultColor() ?? 'white';

        const currentColor = editingBackground
            ? (widget.backgroundColor ?? '')
            : (widget.color ?? defaultColor);

        const nextColor = cycleColor(
            currentColor,
            colors,
            key.rightArrow ? 'right' : 'left'
        );

        const updatedWidget = editingBackground
            ? { ...widget, backgroundColor: nextColor === '' ? undefined : nextColor }
            : { ...widget, color: nextColor };

        onUpdate(updatedWidget);
        return true;
    }

    return false;
}

/**
 * Get current color info for display
 */
export function getCurrentColorInfo(
    widget: WidgetItem,
    editingBackground: boolean
): {
    currentColor: string;
    colorIndex: number;
    totalColors: number;
    displayName: string;
} {
    const colorOptions = editingBackground
        ? getAvailableBackgroundColorsForUI()
        : getAvailableColorsForUI();

    const colors = colorOptions.map(c => c.value);
    const widgetImpl = getWidget(widget.type);
    const defaultColor = widgetImpl?.getDefaultColor() ?? 'white';

    const currentColor = editingBackground
        ? (widget.backgroundColor ?? '')
        : (widget.color ?? defaultColor);

    const colorIndex = colors.indexOf(currentColor);

    // Determine display name
    let displayName: string;
    if (!currentColor || currentColor === '') {
        displayName = editingBackground ? '(no background)' : '(default)';
    } else if (currentColor.startsWith('ansi256:')) {
        displayName = `ANSI ${currentColor.substring(8)}`;
    } else if (currentColor.startsWith('hex:')) {
        displayName = `#${currentColor.substring(4)}`;
    } else {
        const option = colorOptions.find(c => c.value === currentColor);
        displayName = option ? option.name : currentColor;
    }

    return {
        currentColor,
        colorIndex: colorIndex === -1 ? -1 : colorIndex + 1, // 1-indexed for display
        totalColors: colors.length,
        displayName
    };
}