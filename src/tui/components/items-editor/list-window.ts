import { getVisibleWidth } from '../../../utils/ansi';

export interface ListWindow {
    start: number;
    end: number;
    hiddenAbove: number;
    hiddenBelow: number;
}

// Rows the picker screen uses besides the list and the status line preview
// lines: title, preview box, editor header, search line, a one-row description
// and the two "more" markers (14), plus slack for lines that wrap on narrow
// terminals. A longer description takes its extra rows from the list.
const PICKER_RESERVED_ROWS = 16;
const MIN_VISIBLE_ENTRIES = 3;
const DEFAULT_VISIBLE_ENTRIES = 10;

// Keeps the selection centered once the list scrolls, so the entries on both
// sides of it stay visible
export function getListWindow(total: number, selectedIndex: number, maxVisible: number): ListWindow {
    if (total <= maxVisible) {
        return { start: 0, end: total, hiddenAbove: 0, hiddenBelow: 0 };
    }

    const start = Math.min(
        Math.max(0, selectedIndex - Math.floor(maxVisible / 2)),
        total - maxVisible
    );
    const end = start + maxVisible;
    return { start, end, hiddenAbove: start, hiddenBelow: total - end };
}

// Sized so the whole picker screen fits in the terminal, with room for the
// tallest description the list can show. A taller screen scrolls the status
// line preview off the top, and Ink then redraws the whole screen on every key.
export function getPickerMaxVisible(terminalRows: number | undefined, statusLineCount: number, descriptionRows = 1): number {
    if (!terminalRows) {
        return DEFAULT_VISIBLE_ENTRIES;
    }

    return Math.max(MIN_VISIBLE_ENTRIES, terminalRows - PICKER_RESERVED_ROWS - statusLineCount - (descriptionRows - 1));
}

// The rows one line takes, wrapped at spaces as Ink's Text wraps it. A word
// wider than a row starts on its own row and breaks across rows.
function getWrappedRows(line: string, width: number): number {
    let rows = 1;
    let used = 0;
    for (const word of line.split(' ')) {
        const wordWidth = getVisibleWidth(word);
        if (used > 0 && used + 1 + wordWidth <= width) {
            used += 1 + wordWidth;
            continue;
        }
        if (used > 0) {
            rows++;
        }
        rows += Math.floor(Math.max(0, wordWidth - 1) / width);
        used = wordWidth === 0 ? 0 : ((wordWidth - 1) % width) + 1;
    }
    return rows;
}

/** The rows a description takes at this width: each of its lines, wrapped. */
export function getDescriptionRows(description: string, width: number | undefined): number {
    const lines = description.split('\n');
    if (!width || width < 1) {
        return lines.length;
    }
    return lines.reduce((rows, line) => rows + getWrappedRows(line, width), 0);
}
