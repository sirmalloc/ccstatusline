import {
    Box,
    Text,
    useInput,
    type Key
} from 'ink';
import React, { useState } from 'react';

import {
    getColorLevelString,
    type ColorLevelString
} from '../../types/ColorLevel';
import type {
    WidgetEditorProps,
    WidgetItem
} from '../../types/Widget';
import {
    applyColors,
    getAvailableColorsForUI,
    getColorAnsiCode,
    getColorDisplayName
} from '../../utils/colors';
import {
    getPlainInput,
    shouldInsertInput
} from '../../utils/input-guards';

import { parseCustomColor } from './custom-color';

// An editor for a list of per-item colors that can be turned on and off as a
// whole: Thinking Effort's level colors, the Model widget's family colors.

// The colors the status line draws at the configured color level; at No Color
// (colorsDisabled) it draws none
export interface EditorColors {
    colorLevel: ColorLevelString;
    colorsDisabled: boolean;
}

const NAMED_COLORS = getAvailableColorsForUI().map(color => color.value).filter(value => value !== '');

// Custom (hex/ansi256) colors aren't in the named list, so cycling from one
// starts at either end of it
function cycleNamedColor(current: string, direction: 1 | -1): string {
    const index = NAMED_COLORS.indexOf(current);
    let nextIndex = (index + direction + NAMED_COLORS.length) % NAMED_COLORS.length;
    if (index === -1) {
        nextIndex = direction === 1 ? 0 : NAMED_COLORS.length - 1;
    }
    return NAMED_COLORS[nextIndex] ?? current;
}

// Custom colors are labeled the way Edit Colors labels them (ANSI n, #RRGGBB),
// except the default xhigh effort orange, which has no name among the 16
// named colors
function getColorLabel(color: string): string {
    if (color === 'ansi256:208') {
        return 'Orange';
    }
    if (color.startsWith('ansi256:')) {
        return `ANSI ${color.substring(8)}`;
    }
    if (color.startsWith('hex:')) {
        return `#${color.substring(4).toUpperCase()}`;
    }
    return getColorDisplayName(color);
}

function paint(text: string, color: string, colors: EditorColors): string {
    const code = colors.colorsDisabled ? '' : getColorAnsiCode(color, colors.colorLevel);
    return code ? `${code}${text}\x1b[39m` : text;
}

// A color row cycles the named colors with ←→ and takes a custom color with
// (x); a choice row flips between two settings with ←→.
export type ColorListRow<C extends string, X extends string>
    = | { kind: 'color'; key: C; label: string }
        | { kind: 'choice'; key: X; label: string };

export interface ColorListEditorConfig<C extends string, X extends string = never> {
    title: string;
    /** Names the on/off switch, e.g. "Level colors". */
    toggleLabel: string;
    rows: readonly ColorListRow<C, X>[];
    isEnabled: (item: WidgetItem) => boolean;
    setEnabled: (item: WidgetItem, enabled: boolean) => WidgetItem;
    /** The color the status line draws at the given color level. */
    getColor: (item: WidgetItem, key: C, colorLevel: ColorLevelString) => string;
    setColor: (item: WidgetItem, key: C, color: string) => WidgetItem;
    getChoiceLabel?: (item: WidgetItem, key: X) => string;
    cycleChoice?: (item: WidgetItem, key: X) => WidgetItem;
    /** (d)efaults: back to the default colors and choices. */
    resetColors: (item: WidgetItem) => WidgetItem;
    /**
     * The sample shows the highlighted color row, or the last one highlighted:
     * the widget's text with only its own runs colored (Widget.colorsOnlyItsRuns).
     */
    renderSample: (item: WidgetItem, key: C, colors: EditorColors) => string;
    /** The widget's default color, for the rest of the sample while the item has none. */
    defaultColor: string;
}

export interface ColorListEditorProps<C extends string, X extends string> extends WidgetEditorProps { config: ColorListEditorConfig<C, X> }

export function ColorListEditor<C extends string, X extends string = never>({ widget, onComplete, onCancel, settings, config }: Readonly<ColorListEditorProps<C, X>>): React.ReactElement {
    const { rows } = config;
    const firstColorRow = rows.find(row => row.kind === 'color');
    const [draft, setDraft] = useState(widget);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [sampleKey, setSampleKey] = useState<C | undefined>(firstColorRow?.kind === 'color' ? firstColorRow.key : undefined);
    const [customInput, setCustomInput] = useState<string | null>(null);
    const [customError, setCustomError] = useState(false);

    const selectedRow = rows[selectedIndex];
    const enabled = config.isEnabled(draft);
    const colors: EditorColors = {
        colorLevel: getColorLevelString(settings?.colorLevel),
        colorsDisabled: settings?.colorLevel === 0
    };

    const moveTo = (index: number) => {
        setSelectedIndex(index);
        const row = rows[index];
        if (row?.kind === 'color') {
            setSampleKey(row.key);
        }
    };

    // Keys while a custom color is being typed
    const handleCustomInput = (input: string, key: Key, text: string) => {
        if (key.escape) {
            setCustomInput(null);
            setCustomError(false);
        } else if (key.return) {
            const color = parseCustomColor(text);
            if (color && selectedRow?.kind === 'color') {
                setDraft(config.setColor(draft, selectedRow.key, color));
                setCustomInput(null);
                setCustomError(false);
            } else {
                setCustomError(true);
            }
        } else if (key.backspace || key.delete) {
            setCustomInput(text.slice(0, -1));
        } else if (shouldInsertInput(input, key)) {
            setCustomInput(text + input);
            setCustomError(false);
        }
    };

    // ←→: the next named color on a color row, the other choice on a choice row
    const changeSelected = (direction: 1 | -1) => {
        if (selectedRow?.kind === 'choice' && config.cycleChoice) {
            setDraft(config.cycleChoice(draft, selectedRow.key));
        } else if (selectedRow?.kind === 'color') {
            const current = config.getColor(draft, selectedRow.key, colors.colorLevel);
            setDraft(config.setColor(draft, selectedRow.key, cycleNamedColor(current, direction)));
        }
    };

    useInput((input, key) => {
        if (customInput !== null) {
            handleCustomInput(input, key, customInput);
            return;
        }

        const shortcut = getPlainInput(input, key);

        if (key.return) {
            onComplete(draft);
        } else if (key.escape) {
            onCancel();
        } else if (key.upArrow) {
            moveTo((selectedIndex - 1 + rows.length) % rows.length);
        } else if (key.downArrow) {
            moveTo((selectedIndex + 1) % rows.length);
        } else if (key.leftArrow || key.rightArrow) {
            changeSelected(key.rightArrow ? 1 : -1);
        } else if (shortcut === ' ') {
            setDraft(config.setEnabled(draft, !enabled));
        } else if (shortcut === 'x' && selectedRow?.kind === 'color') {
            setCustomInput('');
            setCustomError(false);
        } else if (shortcut === 'd') {
            setDraft(config.resetColors(draft));
        }
    });

    // Colored as the status line colors it: the widget color around the runs
    // the widget colors itself
    const sample = sampleKey === undefined ? '' : applyColors(
        config.renderSample(draft, sampleKey, colors),
        draft.color ?? config.defaultColor,
        undefined,
        false,
        colors.colorLevel,
        undefined,
        true
    );

    return (
        <Box flexDirection='column'>
            <Text bold>{config.title}</Text>
            <Text dimColor>↑↓ select, ←→ change color, Space on/off, (x) custom color, (d)efaults, Enter save, ESC cancel</Text>
            <Box marginTop={1}>
                <Text>Sample: </Text>
                <Text>{sample}</Text>
            </Box>
            <Box marginTop={1}>
                <Text>{`${config.toggleLabel}: `}</Text>
                <Text color={enabled ? 'green' : 'red'}>{enabled ? 'On' : 'Off'}</Text>
                {!enabled && <Text dimColor>  (Space to turn on; the widget uses its single color until then)</Text>}
            </Box>
            {customInput !== null && selectedRow && (
                <Box marginTop={1} flexDirection='column'>
                    <Box>
                        <Text>{`Custom color for ${selectedRow.label} (#RRGGBB or 0-255): `}</Text>
                        <Text color='cyan'>{customInput}</Text>
                    </Box>
                    {customError && <Text color='red'>Not a color. Use #RRGGBB, or a number from 0 to 255.</Text>}
                </Box>
            )}
            <Box marginTop={1} flexDirection='column'>
                {rows.map((row, index) => {
                    const isSelected = index === selectedIndex;
                    let value: string;
                    if (row.kind === 'choice') {
                        value = config.getChoiceLabel ? config.getChoiceLabel(draft, row.key) : '';
                    } else {
                        const color = config.getColor(draft, row.key, colors.colorLevel);
                        value = paint(getColorLabel(color), color, colors);
                    }
                    return (
                        <Box key={row.key} flexDirection='row' flexWrap='nowrap'>
                            <Box width={3}>
                                <Text color={isSelected ? 'green' : undefined}>{isSelected ? '▶ ' : '  '}</Text>
                            </Box>
                            <Box width={11}>
                                <Text color={isSelected ? 'green' : undefined} dimColor={!enabled && !isSelected}>{row.label}</Text>
                            </Box>
                            <Text dimColor={!enabled}>{value}</Text>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}
