import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

import { getVisibleWidth } from './ansi';
import {
    calculateMaxWidthsFromPreRendered,
    renderStatusLine,
    resolveEffectiveTerminalWidth,
    type PreRenderedWidget
} from './renderer';

/** One output row produced by wrapping a configured line. */
export interface WrappedLine {
    widgets: WidgetItem[];
    preRendered: PreRenderedWidget[];
    /** Index of the configured line this row comes from. */
    sourceLine: number;
    /** True for the second and later rows of the same configured line. */
    continuesLine: boolean;
}

export interface WrapResult {
    lines: WrappedLine[];
    /** Column widths to align the rows with (powerline auto-align). */
    maxWidths: number[];
}

/**
 * The smallest piece a line can be split into: a widget plus the widgets merged
 * into it and any widgets after it that render nothing. `lead` holds the
 * separators in front of it, which are dropped when the unit starts a new row.
 */
interface Unit {
    lead: number[];
    body: number[];
}

function isSeparator(widget: WidgetItem): boolean {
    return widget.type === 'separator' || widget.type === 'flex-separator';
}

function unitHasContent(unit: Unit, preRendered: PreRenderedWidget[]): boolean {
    return unit.body.some(index => Boolean(preRendered[index]?.content));
}

export function splitLineIntoUnits(widgets: WidgetItem[], preRendered: PreRenderedWidget[]): Unit[] {
    const units: Unit[] = [];
    let lead: number[] = [];

    for (let i = 0; i < widgets.length; i++) {
        const widget = widgets[i];
        if (!widget)
            continue;

        if (isSeparator(widget)) {
            lead.push(i);
            continue;
        }

        const last = units[units.length - 1];
        const mergedIntoPrevious = lead.length === 0 && Boolean(widgets[i - 1]?.merge);
        const isEmpty = !preRendered[i]?.content;

        // Keep merged widgets together, and let widgets that render nothing
        // ride along with a neighbor instead of taking a slot of their own.
        if (last && (mergedIntoPrevious || isEmpty || !unitHasContent(last, preRendered))) {
            last.body.push(...lead, i);
        } else {
            units.push({ lead, body: [i] });
        }
        lead = [];
    }

    // Trailing separators stay at the end of the line's last row
    const last = units[units.length - 1];
    if (last) {
        last.body.push(...lead);
    }

    return units;
}

function buildRow(
    widgets: WidgetItem[],
    preRendered: PreRenderedWidget[],
    units: Unit[],
    sourceLine: number,
    continuesLine: boolean
): WrappedLine {
    const indices = units.flatMap((unit, k) => (
        k === 0 && continuesLine ? unit.body : [...unit.lead, ...unit.body]
    ));

    return {
        widgets: indices.map(index => widgets[index]).filter((widget): widget is WidgetItem => widget !== undefined),
        preRendered: indices.map(index => preRendered[index]).filter((entry): entry is PreRenderedWidget => entry !== undefined),
        sourceLine,
        continuesLine
    };
}

/** Width of a line with no truncation and flex separators at their minimum. */
function measureLine(
    widgets: WidgetItem[],
    preRendered: PreRenderedWidget[],
    settings: Settings,
    context: RenderContext,
    maxWidths: number[]
): number {
    // A width of 0 resolves to "unknown", which turns truncation and flex
    // expansion off, so this is the line's natural width.
    const line = renderStatusLine(widgets, settings, { ...context, terminalWidth: 0 }, preRendered, maxWidths);
    return getVisibleWidth(line);
}

/**
 * Wraps lines that are wider than the terminal onto extra rows instead of
 * letting them be truncated. Returns null when wrapping is off, the terminal
 * width is unknown, or every line already fits.
 *
 * With powerline auto-align on, every widget gets the same width (the widest
 * one) and each line gets as many columns as fit, so the rows form a grid.
 * Otherwise each row takes as many widgets as fit.
 */
export function wrapLinesToFit(
    lines: WidgetItem[][],
    preRenderedLines: PreRenderedWidget[][],
    settings: Settings,
    context: RenderContext
): WrapResult | null {
    const available = resolveEffectiveTerminalWidth(context.terminalWidth ?? null);
    if (!settings.wrapToFit || available === null) {
        return null;
    }

    const preRenderedFor = (lineIndex: number): PreRenderedWidget[] => preRenderedLines[lineIndex] ?? [];
    const fits = (row: WrappedLine, maxWidths: number[]): boolean => (
        measureLine(row.widgets, row.preRendered, settings, { ...context, lineIndex: row.sourceLine }, maxWidths) <= available
    );

    const naturalMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
    const allFit = lines.every((widgets, lineIndex) => (
        widgets.length === 0
        || fits({ widgets, preRendered: preRenderedFor(lineIndex), sourceLine: lineIndex, continuesLine: false }, naturalMaxWidths)
    ));
    if (allFit) {
        return null;
    }

    const unitsPerLine = lines.map((widgets, lineIndex) => splitLineIntoUnits(widgets, preRenderedFor(lineIndex)));

    if (settings.powerline.enabled && settings.powerline.autoAlign) {
        return wrapAsGrid(lines, preRenderedFor, unitsPerLine, settings, fits);
    }

    const rows: WrappedLine[] = [];
    lines.forEach((widgets, lineIndex) => {
        const preRendered = preRenderedFor(lineIndex);
        let current: Unit[] = [];
        for (const unit of unitsPerLine[lineIndex] ?? []) {
            const continuesLine = rows.length > 0 && rows[rows.length - 1]?.sourceLine === lineIndex;
            const candidate = buildRow(widgets, preRendered, [...current, unit], lineIndex, continuesLine);
            if (current.length > 0 && !fits(candidate, naturalMaxWidths)) {
                rows.push(buildRow(widgets, preRendered, current, lineIndex, continuesLine));
                current = [unit];
            } else {
                current.push(unit);
            }
        }
        if (current.length > 0) {
            const continuesLine = rows.length > 0 && rows[rows.length - 1]?.sourceLine === lineIndex;
            rows.push(buildRow(widgets, preRendered, current, lineIndex, continuesLine));
        }
    });

    return { lines: rows, maxWidths: naturalMaxWidths };
}

function wrapAsGrid(
    lines: WidgetItem[][],
    preRenderedFor: (lineIndex: number) => PreRenderedWidget[],
    unitsPerLine: Unit[][],
    settings: Settings,
    fits: (row: WrappedLine, maxWidths: number[]) => boolean
): WrapResult {
    // Measure every unit as its own column; the widest sets the cell width.
    // Widgets excluded from auto-align are left out and keep their own width.
    const unitEntries = unitsPerLine.flatMap((units, lineIndex) => units.map(unit => (
        unit.body
            .map(index => preRenderedFor(lineIndex)[index])
            .filter((entry): entry is PreRenderedWidget => entry !== undefined)
    )));
    const cellWidth = Math.max(0, ...unitEntries.map(entries => calculateMaxWidthsFromPreRendered([entries], settings)[0] ?? 0));
    const maxColumns = Math.max(1, ...unitsPerLine.map(units => units.length));

    for (let columns = maxColumns; columns >= 1; columns--) {
        const maxWidths = new Array<number>(columns).fill(cellWidth);
        const rows: WrappedLine[] = [];

        lines.forEach((widgets, lineIndex) => {
            const units = unitsPerLine[lineIndex] ?? [];
            if (units.length === 0)
                return;
            // Spread units evenly over the rows this line needs (4 + 4, not 7 + 1)
            const rowCount = Math.ceil(units.length / columns);
            const perRow = Math.ceil(units.length / rowCount);
            for (let start = 0; start < units.length; start += perRow) {
                rows.push(buildRow(widgets, preRenderedFor(lineIndex), units.slice(start, start + perRow), lineIndex, start > 0));
            }
        });

        if (columns === 1 || rows.every(row => fits(row, maxWidths))) {
            return { lines: rows, maxWidths };
        }
    }

    // Unreachable: the loop always returns at one column
    return { lines: [], maxWidths: [] };
}
