import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { renderStatusLine } from '../renderer';

interface PreRenderedWidget {
    content: string;
    plainLength: number;
    widget: WidgetItem;
}

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        ...overrides,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(overrides.powerline ?? {})
        }
    };
}

function makePreRendered(widgets: WidgetItem[], contentByIndex: Record<number, string>): PreRenderedWidget[] {
    return widgets.map((widget, i) => {
        const content = contentByIndex[i] ?? '';
        return { content, plainLength: content.length, widget };
    });
}

function render(
    widgets: WidgetItem[],
    contentByIndex: Record<number, string>,
    settingsOverrides: Partial<Settings> = {}
): string {
    const settings = createSettings({ colorLevel: 0, ...settingsOverrides });
    const context: RenderContext = { isPreview: false, terminalWidth: 200 };
    const preRenderedWidgets = makePreRendered(widgets, contentByIndex);
    return renderStatusLine(widgets, settings, context, preRenderedWidgets, []);
}

const T = (id: string): WidgetItem => ({ id, type: 'custom-text' });
const SEP: WidgetItem = { id: 'sep', type: 'separator' };

describe('renderer separator collapse around empty widgets', () => {
    it('emits exactly one separator between content widgets (regression baseline)', () => {
        const widgets = [T('a'), SEP, T('b')];
        const out = render(widgets, { 0: 'A', 2: 'B' });
        expect((out.match(/\|/g) ?? []).length).toBe(1);
    });

    it('drops the trailing separator when the widget after it renders empty', () => {
        const widgets = [T('a'), SEP, T('b'), SEP, T('c')];
        // 'b' renders empty; the separator after 'b' (before 'c') must be dropped
        const out = render(widgets, { 0: 'A', 2: '', 4: 'C' });
        expect((out.match(/\|/g) ?? []).length).toBe(1);
        expect(out).toContain('A');
        expect(out).toContain('C');
    });

    it('collapses multiple consecutive empty widgets into a single separator', () => {
        const widgets = [T('a'), SEP, T('b'), SEP, T('c'), SEP, T('d')];
        // both 'b' and 'c' render empty
        const out = render(widgets, { 0: 'A', 2: '', 4: '', 6: 'D' });
        expect((out.match(/\|/g) ?? []).length).toBe(1);
    });

    it('suppresses a leading separator when no prior widget has rendered (existing behavior)', () => {
        const widgets = [T('a'), SEP, T('b')];
        // 'a' renders empty; the separator after it should not emit
        const out = render(widgets, { 0: '', 2: 'B' });
        expect(out).not.toMatch(/\|/);
    });

    it('drops separators that follow a sequence of leading empty widgets', () => {
        const widgets = [T('a'), SEP, T('b'), SEP, T('c')];
        // both 'a' and 'b' render empty; only 'c' has content
        const out = render(widgets, { 0: '', 2: '', 4: 'C' });
        expect(out).not.toMatch(/\|/);
        expect(out).toContain('C');
    });

    it('removes trailing separator when the last widget renders empty', () => {
        const widgets = [T('a'), SEP, T('b')];
        // 'b' renders empty
        const out = render(widgets, { 0: 'A', 2: '' });
        expect(out).not.toMatch(/\|/);
        expect(out).toContain('A');
    });

    it('keeps separators between widgets that all rendered content', () => {
        const widgets = [T('a'), SEP, T('b'), SEP, T('c')];
        const out = render(widgets, { 0: 'A', 2: 'B', 4: 'C' });
        expect((out.match(/\|/g) ?? []).length).toBe(2);
    });

    it('does not affect the auto-separator (defaultSeparator) path', () => {
        // The auto-separator path operates on the already-filtered `elements`
        // array (line ~778) — empty widgets never reach it. This test locks in
        // that the fix doesn't accidentally couple to the auto-separator logic.
        const widgets = [T('a'), T('b'), T('c')];
        const out = render(widgets, { 0: 'A', 1: '', 2: 'C' }, { defaultSeparator: '·' });

        // With B empty, exactly one auto-added '·' should appear between A and C.
        expect((out.match(/·/g) ?? []).length).toBe(1);
        expect(out).toContain('A');
        expect(out).toContain('C');
    });

    it('lets a merge:no-padding widget glue to the next visible widget across an empty middle widget', () => {
        // Layout: [A(merge:no-padding), B(empty), SEP, C].
        //
        // Without the fix, the SEP between B and C would emit (its walkback
        // would skip past B's empty content and find A with content), so
        // `elements` would be [A, SEP, C] and A's merge would not reach C
        // (the separator sits between them in the element chain).
        //
        // With the fix, the SEP is suppressed because B (the immediate-prior
        // non-separator) is empty. `elements` becomes [A, C] and the
        // omitLeadingPadding check at the C step sees prevElem=A with
        // merge:'no-padding' — A glues directly to C with no padding or
        // separator between them.
        const widgets: WidgetItem[] = [
            { id: 'a', type: 'custom-text', merge: 'no-padding' },
            { id: 'b', type: 'custom-text' },
            SEP,
            { id: 'c', type: 'custom-text' }
        ];
        const out = render(widgets, { 0: 'A', 1: '', 3: 'C' });

        // No separator visible.
        expect(out).not.toMatch(/\|/);
        // A and C are present and adjacent (only intra-widget content between
        // them after stripping ANSI), confirming the merge took effect.
        const stripped = out.replace(/\[[0-9;]*m/g, '');
        expect(stripped).toContain('A');
        expect(stripped).toContain('C');
        // No whitespace separator between A and C — they are directly adjacent.
        expect(stripped).toMatch(/A\s*C/);
        expect(stripped).not.toMatch(/A\s+\S+\s+C/);
    });
});
