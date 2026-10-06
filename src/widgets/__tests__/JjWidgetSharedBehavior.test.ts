import { execFileSync } from 'node:child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type {
    Widget,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { JjBookmarksWidget } from '../JjBookmarks';
import { JjChangesWidget } from '../JjChanges';
import { JjDeletionsWidget } from '../JjDeletions';
import { JjDescriptionWidget } from '../JjDescription';
import { JjInsertionsWidget } from '../JjInsertions';
import { JjRevisionWidget } from '../JjRevision';
import { JjRootDirWidget } from '../JjRootDir';
import { JjWorkspaceWidget } from '../JjWorkspace';
import {
    NO_JJ_HIDEABLE_STATE,
    getEnabledHideStates
} from '../shared/hideable';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => string) => void;
};

// Each jj call returns the next output; an Error, or running out, makes it fail
function mockJjOutputs(...outputs: (string | Error)[]): void {
    mockExecFileSync.mockImplementation(() => {
        const output = outputs.shift() ?? new Error('jj failed');
        if (output instanceof Error) {
            throw output;
        }

        return output;
    });
}

function makeItem(itemType: string, overrides: Partial<WidgetItem> = {}): WidgetItem {
    return { id: itemType, type: itemType, ...overrides };
}

const HIDE_NO_JJ = { metadata: { hide: 'no-jj' } };

const cases: {
    name: string;
    itemType: string;
    widget: Widget;
    color: string;
    displayName: string;
    rawValue: boolean;
    keys: string[];
    // Outside a jj repo
    noJj: string;
    // Inside a jj repo when the widget's own jj command fails
    commandFailed: string;
    // Whether the no-jj hide state also drops commandFailed
    hidesCommandFailed: boolean;
}[] = [
    { name: 'JjBookmarksWidget', itemType: 'jj-bookmarks', widget: new JjBookmarksWidget(), color: 'magenta', displayName: 'JJ Bookmarks', rawValue: true, keys: ['g'], noJj: '🔖 no jj', commandFailed: '🔖 (none)', hidesCommandFailed: true },
    { name: 'JjWorkspaceWidget', itemType: 'jj-workspace', widget: new JjWorkspaceWidget(), color: 'blue', displayName: 'JJ Workspace', rawValue: true, keys: ['g'], noJj: '◆ no jj', commandFailed: '◆ no jj', hidesCommandFailed: true },
    { name: 'JjRootDirWidget', itemType: 'jj-root-dir', widget: new JjRootDirWidget(), color: 'cyan', displayName: 'JJ Root Dir', rawValue: false, keys: [], noJj: 'no jj', commandFailed: 'no jj', hidesCommandFailed: true },
    { name: 'JjChangesWidget', itemType: 'jj-changes', widget: new JjChangesWidget(), color: 'yellow', displayName: 'JJ Changes', rawValue: false, keys: ['g'], noJj: '(no jj)', commandFailed: '(+0,-0)', hidesCommandFailed: false },
    { name: 'JjInsertionsWidget', itemType: 'jj-insertions', widget: new JjInsertionsWidget(), color: 'green', displayName: 'JJ Insertions', rawValue: false, keys: ['g'], noJj: '(no jj)', commandFailed: '+0', hidesCommandFailed: false },
    { name: 'JjDeletionsWidget', itemType: 'jj-deletions', widget: new JjDeletionsWidget(), color: 'red', displayName: 'JJ Deletions', rawValue: false, keys: ['g'], noJj: '(no jj)', commandFailed: '-0', hidesCommandFailed: false },
    { name: 'JjDescriptionWidget', itemType: 'jj-description', widget: new JjDescriptionWidget(), color: 'white', displayName: 'JJ Description', rawValue: false, keys: [], noJj: 'no jj', commandFailed: 'no jj', hidesCommandFailed: true },
    { name: 'JjRevisionWidget', itemType: 'jj-revision', widget: new JjRevisionWidget(), color: 'green', displayName: 'JJ Revision', rawValue: true, keys: ['g'], noJj: ' no jj', commandFailed: ' no jj', hidesCommandFailed: true }
];

// The widgets whose glyph is one prefix (the item's character), with what
// their jj command printed and the value shown for it
const glyphCases: {
    name: string;
    itemType: string;
    widget: Widget;
    output: string;
    value: string;
    commandFailedText: string;
}[] = [
    { name: 'JjBookmarksWidget', itemType: 'jj-bookmarks', widget: new JjBookmarksWidget(), output: 'main feature', value: 'main, feature', commandFailedText: '(none)' },
    { name: 'JjWorkspaceWidget', itemType: 'jj-workspace', widget: new JjWorkspaceWidget(), output: 'feature\n', value: 'feature', commandFailedText: 'no jj' },
    { name: 'JjRevisionWidget', itemType: 'jj-revision', widget: new JjRevisionWidget(), output: 'kkmpptxz', value: 'kkmpptxz', commandFailedText: 'no jj' }
];

// The widgets whose +/- signs are named symbol slots
const DIFF_STAT = 'src/main.ts | 5 +++--\n1 file changed, 3 insertions(+), 2 deletions(-)';
const slotCases: {
    name: string;
    itemType: string;
    widget: Widget;
    defaultValue: string;
    overriddenValue: string;
    clearedValue: string;
}[] = [
    { name: 'JjChangesWidget', itemType: 'jj-changes', widget: new JjChangesWidget(), defaultValue: '(+3,-2)', overriddenValue: '(▲3,▼2)', clearedValue: '(3,2)' },
    { name: 'JjInsertionsWidget', itemType: 'jj-insertions', widget: new JjInsertionsWidget(), defaultValue: '+3', overriddenValue: '▲3', clearedValue: '3' },
    { name: 'JjDeletionsWidget', itemType: 'jj-deletions', widget: new JjDeletionsWidget(), defaultValue: '-2', overriddenValue: '▼2', clearedValue: '2' }
];

describe('JJ widget shared behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each(cases)('$name should declare the no-jj hideable state', ({ widget }) => {
        const states = widget.getHideableStates?.() ?? [];
        expect(states.map(state => state.key)).toContain('no-jj');
    });

    it.each(cases)('$name should not declare per-widget hide keybinds', ({ widget }) => {
        const keybinds = widget.getCustomKeybinds?.() ?? [];
        expect(keybinds.find(kb => kb.key === 'h')).toBeUndefined();
    });

    it.each(cases)('$name should enable no-jj via the unified hide metadata', ({ widget, itemType }) => {
        const item: WidgetItem = {
            id: itemType,
            type: itemType,
            metadata: { hide: 'no-jj' }
        };

        expect(getEnabledHideStates(item, widget.getHideableStates?.() ?? [])).toContain('no-jj');
    });

    it.each(cases)('$name should describe itself in the editor', ({ widget, itemType, color, displayName, rawValue, keys }) => {
        const item = makeItem(itemType);

        expect(widget.getCategory()).toBe('Jujutsu');
        expect(widget.getDefaultColor()).toBe(color);
        expect(widget.getDisplayName()).toBe(displayName);
        expect(widget.getEditorDisplay(item)).toStrictEqual({ displayText: displayName });
        expect(widget.getHideableStates?.()).toEqual([NO_JJ_HIDEABLE_STATE]);
        expect(widget.supportsRawValue()).toBe(rawValue);
        expect(widget.supportsColors(item)).toBe(true);
        expect((widget.getCustomKeybinds?.() ?? []).map(keybind => keybind.key)).toEqual(keys);
        expect(typeof widget.renderEditor).toBe(keys.length > 0 ? 'function' : 'undefined');
    });

    it.each(cases)('$name should render its preview without running jj', ({ widget, itemType }) => {
        expect(widget.render(makeItem(itemType), { isPreview: true }, DEFAULT_SETTINGS)).not.toBeNull();
        expect(mockExecFileSync.mock.calls).toHaveLength(0);
    });

    it.each(cases)('$name should show $noJj outside a jj repo without running its own command', ({ widget, itemType, noJj }) => {
        mockJjOutputs();

        expect(widget.render(makeItem(itemType), {}, DEFAULT_SETTINGS)).toBe(noJj);
        expect(mockExecFileSync.mock.calls).toHaveLength(1);
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['root']);
    });

    it.each(cases)('$name should hide its placeholder outside a jj repo with no-jj', ({ widget, itemType }) => {
        mockJjOutputs();

        expect(widget.render(makeItem(itemType, HIDE_NO_JJ), {}, DEFAULT_SETTINGS)).toBeNull();
    });

    it.each(cases)('$name should show $commandFailed when its jj command fails', ({ widget, itemType, commandFailed }) => {
        mockJjOutputs('/tmp/repo\n');

        expect(widget.render(makeItem(itemType), {}, DEFAULT_SETTINGS)).toBe(commandFailed);
        expect(mockExecFileSync.mock.calls).toHaveLength(2);
    });

    it.each(cases)('$name should apply no-jj to a failed jj command only when it shows a placeholder', ({ widget, itemType, commandFailed, hidesCommandFailed }) => {
        mockJjOutputs('/tmp/repo\n');

        expect(widget.render(makeItem(itemType, HIDE_NO_JJ), {}, DEFAULT_SETTINGS)).toBe(hidesCommandFailed ? null : commandFailed);
    });
});

describe('JJ widget glyph prefixes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each(glyphCases)('$name should prefix a live value with a glyph override', ({ widget, itemType, output, value }) => {
        mockJjOutputs('/tmp/repo\n', output);

        expect(widget.render(makeItem(itemType, { character: '★' }), {}, DEFAULT_SETTINGS)).toBe(`★ ${value}`);
    });

    it.each(glyphCases)('$name should drop the glyph and its space on an empty override', ({ widget, itemType, output, value }) => {
        mockJjOutputs('/tmp/repo\n', output);

        expect(widget.render(makeItem(itemType, { character: '' }), {}, DEFAULT_SETTINGS)).toBe(value);
    });

    it.each(glyphCases)('$name should drop the glyph from a raw value', ({ widget, itemType, output, value }) => {
        mockJjOutputs('/tmp/repo\n', output);

        expect(widget.render(makeItem(itemType, { character: '★', rawValue: true }), {}, DEFAULT_SETTINGS)).toBe(value);
    });

    it.each(glyphCases)('$name should keep the glyph on placeholders in raw mode', ({ widget, itemType, commandFailedText }) => {
        const item = makeItem(itemType, { character: '★', rawValue: true });

        mockJjOutputs();
        expect(widget.render(item, {}, DEFAULT_SETTINGS)).toBe('★ no jj');

        mockJjOutputs('/tmp/repo\n');
        expect(widget.render(item, {}, DEFAULT_SETTINGS)).toBe(`★ ${commandFailedText}`);
    });
});

describe('JJ widget symbol slots', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each(slotCases)('$name should render live counts with its default symbols', ({ widget, itemType, defaultValue }) => {
        mockJjOutputs('/tmp/repo\n', DIFF_STAT);

        expect(widget.render(makeItem(itemType), {}, DEFAULT_SETTINGS)).toBe(defaultValue);
    });

    it.each(slotCases)('$name should render live counts with slot overrides', ({ widget, itemType, overriddenValue }) => {
        mockJjOutputs('/tmp/repo\n', DIFF_STAT);
        const item = makeItem(itemType, { metadata: { symbolInsertions: '▲', symbolDeletions: '▼' } });

        expect(widget.render(item, {}, DEFAULT_SETTINGS)).toBe(overriddenValue);
    });

    it.each(slotCases)('$name should render live counts without symbols on empty overrides', ({ widget, itemType, clearedValue }) => {
        mockJjOutputs('/tmp/repo\n', DIFF_STAT);
        const item = makeItem(itemType, { metadata: { symbolInsertions: '', symbolDeletions: '' } });

        expect(widget.render(item, {}, DEFAULT_SETTINGS)).toBe(clearedValue);
    });

    it.each(slotCases)('$name should not put slot symbols on its placeholder', ({ widget, itemType }) => {
        mockJjOutputs();
        const item = makeItem(itemType, { metadata: { symbolInsertions: '▲', symbolDeletions: '▼' } });

        expect(widget.render(item, {}, DEFAULT_SETTINGS)).toBe('(no jj)');
    });
});
