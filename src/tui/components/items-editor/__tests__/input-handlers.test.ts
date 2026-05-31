import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { WidgetItem } from '../../../../types/Widget';
import type { WidgetCatalogEntry } from '../../../../utils/widgets';
import {
    handleMoveInputMode,
    handleNormalInputMode,
    handlePickerInputMode,
    normalizePickerState,
    type WidgetPickerState
} from '../input-handlers';

function createStateSetter<T>(initial: T) {
    let state = initial;

    return {
        get: () => state,
        set: (value: T | ((prev: T) => T)) => {
            state = typeof value === 'function'
                ? (value as (prev: T) => T)(state)
                : value;
        }
    };
}

function requireState<T>(value: T | null): T {
    if (!value) {
        throw new Error('Expected state value');
    }

    return value;
}

function createCatalog(entries: (Partial<WidgetCatalogEntry> & Pick<WidgetCatalogEntry, 'type'>)[]): WidgetCatalogEntry[] {
    return entries.map(entry => ({
        type: entry.type,
        displayName: entry.displayName ?? entry.type,
        description: entry.description ?? entry.type,
        category: entry.category ?? 'Other',
        searchText: `${entry.displayName ?? entry.type} ${entry.description ?? entry.type} ${entry.type}`.toLowerCase()
    }));
}

describe('items-editor input handlers', () => {
    it('normalizes picker state with valid fallback category and selected type', () => {
        const widgetCatalog = createCatalog([
            { type: 'git-branch', displayName: 'Git Branch', category: 'Git' }
        ]);
        const widgetCategories = ['All', 'Git'];
        const state: WidgetPickerState = {
            action: 'change',
            level: 'category',
            selectedCategory: 'Missing',
            categoryQuery: '',
            widgetQuery: '',
            selectedType: null
        };

        const normalized = normalizePickerState(state, widgetCatalog, widgetCategories);

        expect(normalized.selectedCategory).toBe('All');
        expect(normalized.selectedType).toBe('git-branch');
    });

    it('applies top-level category search selection on Enter', () => {
        const widgetCatalog = createCatalog([
            { type: 'git-branch', displayName: 'Git Branch', category: 'Git' }
        ]);
        const widgetCategories = ['All', 'Git'];
        const pickerState = createStateSetter<WidgetPickerState | null>({
            action: 'change',
            level: 'category',
            selectedCategory: 'All',
            categoryQuery: 'git',
            widgetQuery: '',
            selectedType: 'git-branch'
        });
        const applySelection = vi.fn();

        handlePickerInputMode({
            input: '',
            key: { return: true },
            widgetPicker: requireState(pickerState.get()),
            widgetCatalog,
            widgetCategories,
            setWidgetPicker: pickerState.set,
            applyWidgetPickerSelection: applySelection
        });

        expect(applySelection).toHaveBeenCalledWith('git-branch');
    });

    it('resets selection to best match when typing in category search', () => {
        const widgetCatalog = createCatalog([
            { type: 'vim-mode', displayName: 'Vim Mode', category: 'Core' },
            { type: 'git-branch', displayName: 'Git Branch', category: 'Core' }
        ]);
        const widgetCategories = ['All', 'Core'];
        const pickerState = createStateSetter<WidgetPickerState | null>({
            action: 'change',
            level: 'category',
            selectedCategory: 'All',
            categoryQuery: '',
            widgetQuery: '',
            selectedType: 'git-branch'
        });

        handlePickerInputMode({
            input: 'v',
            key: {},
            widgetPicker: requireState(pickerState.get()),
            widgetCatalog,
            widgetCategories,
            setWidgetPicker: pickerState.set,
            applyWidgetPickerSelection: vi.fn()
        });

        expect(pickerState.get()?.selectedType).toBe('vim-mode');
    });

    it('resets selection to best match when typing in widget search', () => {
        const widgetCatalog = createCatalog([
            { type: 'vim-mode', displayName: 'Vim Mode', category: 'Core' },
            { type: 'git-branch', displayName: 'Git Branch', category: 'Core' }
        ]);
        const widgetCategories = ['All', 'Core'];
        const pickerState = createStateSetter<WidgetPickerState | null>({
            action: 'change',
            level: 'widget',
            selectedCategory: 'Core',
            categoryQuery: '',
            widgetQuery: '',
            selectedType: 'git-branch'
        });

        handlePickerInputMode({
            input: 'v',
            key: {},
            widgetPicker: requireState(pickerState.get()),
            widgetCatalog,
            widgetCategories,
            setWidgetPicker: pickerState.set,
            applyWidgetPickerSelection: vi.fn()
        });

        expect(pickerState.get()?.selectedType).toBe('vim-mode');
    });

    it('returns to category level from widget picker on escape when widget query is empty', () => {
        const widgetCatalog = createCatalog([
            { type: 'git-branch', displayName: 'Git Branch', category: 'Git' }
        ]);
        const widgetCategories = ['All', 'Git'];
        const pickerState = createStateSetter<WidgetPickerState | null>({
            action: 'change',
            level: 'widget',
            selectedCategory: 'Git',
            categoryQuery: '',
            widgetQuery: '',
            selectedType: 'git-branch'
        });

        handlePickerInputMode({
            input: '',
            key: { escape: true },
            widgetPicker: requireState(pickerState.get()),
            widgetCatalog,
            widgetCategories,
            setWidgetPicker: pickerState.set,
            applyWidgetPickerSelection: vi.fn()
        });

        expect(pickerState.get()?.level).toBe('category');
    });

    it('wraps to last category when pressing up at first category', () => {
        const widgetCatalog = createCatalog([
            { type: 'git-branch', displayName: 'Git Branch', category: 'Git' },
            { type: 'tokens-input', displayName: 'Tokens Input', category: 'Tokens' }
        ]);
        const widgetCategories = ['All', 'Git', 'Tokens'];
        const pickerState = createStateSetter<WidgetPickerState | null>({
            action: 'change',
            level: 'category',
            selectedCategory: 'All',
            categoryQuery: '',
            widgetQuery: '',
            selectedType: null
        });

        handlePickerInputMode({
            input: '',
            key: { upArrow: true },
            widgetPicker: requireState(pickerState.get()),
            widgetCatalog,
            widgetCategories,
            setWidgetPicker: pickerState.set,
            applyWidgetPickerSelection: vi.fn()
        });

        expect(pickerState.get()?.selectedCategory).toBe('Tokens');
    });

    it('wraps to first category when pressing down at last category', () => {
        const widgetCatalog = createCatalog([
            { type: 'git-branch', displayName: 'Git Branch', category: 'Git' },
            { type: 'tokens-input', displayName: 'Tokens Input', category: 'Tokens' }
        ]);
        const widgetCategories = ['All', 'Git', 'Tokens'];
        const pickerState = createStateSetter<WidgetPickerState | null>({
            action: 'change',
            level: 'category',
            selectedCategory: 'Tokens',
            categoryQuery: '',
            widgetQuery: '',
            selectedType: null
        });

        handlePickerInputMode({
            input: '',
            key: { downArrow: true },
            widgetPicker: requireState(pickerState.get()),
            widgetCatalog,
            widgetCategories,
            setWidgetPicker: pickerState.set,
            applyWidgetPickerSelection: vi.fn()
        });

        expect(pickerState.get()?.selectedCategory).toBe('All');
    });

    it('wraps to last widget when pressing up at first widget in picker', () => {
        const widgetCatalog = createCatalog([
            { type: 'git-branch', displayName: 'Git Branch', category: 'Git' },
            { type: 'git-changes', displayName: 'Git Changes', category: 'Git' },
            { type: 'git-insertions', displayName: 'Git Insertions', category: 'Git' }
        ]);
        const widgetCategories = ['All', 'Git'];
        const pickerState = createStateSetter<WidgetPickerState | null>({
            action: 'change',
            level: 'widget',
            selectedCategory: 'Git',
            categoryQuery: '',
            widgetQuery: '',
            selectedType: 'git-branch'
        });

        handlePickerInputMode({
            input: '',
            key: { upArrow: true },
            widgetPicker: requireState(pickerState.get()),
            widgetCatalog,
            widgetCategories,
            setWidgetPicker: pickerState.set,
            applyWidgetPickerSelection: vi.fn()
        });

        expect(pickerState.get()?.selectedType).toBe('git-insertions');
    });

    it('wraps to first widget when pressing down at last widget in picker', () => {
        const widgetCatalog = createCatalog([
            { type: 'git-branch', displayName: 'Git Branch', category: 'Git' },
            { type: 'git-changes', displayName: 'Git Changes', category: 'Git' },
            { type: 'git-insertions', displayName: 'Git Insertions', category: 'Git' }
        ]);
        const widgetCategories = ['All', 'Git'];
        const pickerState = createStateSetter<WidgetPickerState | null>({
            action: 'change',
            level: 'widget',
            selectedCategory: 'Git',
            categoryQuery: '',
            widgetQuery: '',
            selectedType: 'git-insertions'
        });

        handlePickerInputMode({
            input: '',
            key: { downArrow: true },
            widgetPicker: requireState(pickerState.get()),
            widgetCatalog,
            widgetCategories,
            setWidgetPicker: pickerState.set,
            applyWidgetPickerSelection: vi.fn()
        });

        expect(pickerState.get()?.selectedType).toBe('git-branch');
    });

    it('wraps to last search result when pressing up at first in top-level search', () => {
        const widgetCatalog = createCatalog([
            { type: 'git-branch', displayName: 'Git Branch', category: 'Git' },
            { type: 'git-changes', displayName: 'Git Changes', category: 'Git' }
        ]);
        const widgetCategories = ['All', 'Git'];
        const pickerState = createStateSetter<WidgetPickerState | null>({
            action: 'change',
            level: 'category',
            selectedCategory: 'All',
            categoryQuery: 'git',
            widgetQuery: '',
            selectedType: 'git-branch'
        });

        handlePickerInputMode({
            input: '',
            key: { upArrow: true },
            widgetPicker: requireState(pickerState.get()),
            widgetCatalog,
            widgetCategories,
            setWidgetPicker: pickerState.set,
            applyWidgetPickerSelection: vi.fn()
        });

        expect(pickerState.get()?.selectedType).toBe('git-changes');
    });

    it('wraps to first search result when pressing down at last in top-level search', () => {
        const widgetCatalog = createCatalog([
            { type: 'git-branch', displayName: 'Git Branch', category: 'Git' },
            { type: 'git-changes', displayName: 'Git Changes', category: 'Git' }
        ]);
        const widgetCategories = ['All', 'Git'];
        const pickerState = createStateSetter<WidgetPickerState | null>({
            action: 'change',
            level: 'category',
            selectedCategory: 'All',
            categoryQuery: 'git',
            widgetQuery: '',
            selectedType: 'git-changes'
        });

        handlePickerInputMode({
            input: '',
            key: { downArrow: true },
            widgetPicker: requireState(pickerState.get()),
            widgetCatalog,
            widgetCategories,
            setWidgetPicker: pickerState.set,
            applyWidgetPickerSelection: vi.fn()
        });

        expect(pickerState.get()?.selectedType).toBe('git-branch');
    });

    it('moves selected widget up in move mode', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'tokens-input' },
            { id: '2', type: 'tokens-output' }
        ];
        const onUpdate = vi.fn();
        const setSelectedIndex = vi.fn();
        const setMoveMode = vi.fn();

        handleMoveInputMode({
            key: { upArrow: true },
            widgets,
            selectedIndex: 1,
            onUpdate,
            setSelectedIndex,
            setMoveMode
        });

        expect(onUpdate).toHaveBeenCalledWith([
            { id: '2', type: 'tokens-output' },
            { id: '1', type: 'tokens-input' }
        ]);
        expect(setSelectedIndex).toHaveBeenCalledWith(0);
        expect(setMoveMode).not.toHaveBeenCalled();
    });

    it('wraps to last widget when pressing up at first position in normal mode', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'tokens-input' },
            { id: '2', type: 'tokens-output' },
            { id: '3', type: 'git-branch' }
        ];
        const setSelectedIndex = vi.fn();

        handleNormalInputMode({
            input: '',
            key: { upArrow: true },
            widgets,
            selectedIndex: 0,
            separatorChars: ['|'],
            onBack: vi.fn(),
            onUpdate: vi.fn(),
            setSelectedIndex,
            setMoveMode: vi.fn(),
            setShowClearConfirm: vi.fn(),
            openWidgetPicker: vi.fn(),
            getCustomKeybindsForWidget: (widgetImpl, widget) => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds(widget) : [],
            setCustomEditorWidget: vi.fn()
        });

        expect(setSelectedIndex).toHaveBeenCalledWith(2);
    });

    it('wraps to first widget when pressing down at last position in normal mode', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'tokens-input' },
            { id: '2', type: 'tokens-output' },
            { id: '3', type: 'git-branch' }
        ];
        const setSelectedIndex = vi.fn();

        handleNormalInputMode({
            input: '',
            key: { downArrow: true },
            widgets,
            selectedIndex: 2,
            separatorChars: ['|'],
            onBack: vi.fn(),
            onUpdate: vi.fn(),
            setSelectedIndex,
            setMoveMode: vi.fn(),
            setShowClearConfirm: vi.fn(),
            openWidgetPicker: vi.fn(),
            getCustomKeybindsForWidget: (widgetImpl, widget) => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds(widget) : [],
            setCustomEditorWidget: vi.fn()
        });

        expect(setSelectedIndex).toHaveBeenCalledWith(0);
    });

    it('wraps to last position when moving widget up from first position', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'tokens-input' },
            { id: '2', type: 'tokens-output' },
            { id: '3', type: 'git-branch' }
        ];
        const onUpdate = vi.fn();
        const setSelectedIndex = vi.fn();

        handleMoveInputMode({
            key: { upArrow: true },
            widgets,
            selectedIndex: 0,
            onUpdate,
            setSelectedIndex,
            setMoveMode: vi.fn()
        });

        expect(onUpdate).toHaveBeenCalledWith([
            { id: '3', type: 'git-branch' },
            { id: '2', type: 'tokens-output' },
            { id: '1', type: 'tokens-input' }
        ]);
        expect(setSelectedIndex).toHaveBeenCalledWith(2);
    });

    it('wraps to first position when moving widget down from last position', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'tokens-input' },
            { id: '2', type: 'tokens-output' },
            { id: '3', type: 'git-branch' }
        ];
        const onUpdate = vi.fn();
        const setSelectedIndex = vi.fn();

        handleMoveInputMode({
            key: { downArrow: true },
            widgets,
            selectedIndex: 2,
            onUpdate,
            setSelectedIndex,
            setMoveMode: vi.fn()
        });

        expect(onUpdate).toHaveBeenCalledWith([
            { id: '3', type: 'git-branch' },
            { id: '2', type: 'tokens-output' },
            { id: '1', type: 'tokens-input' }
        ]);
        expect(setSelectedIndex).toHaveBeenCalledWith(0);
    });

    it('toggles raw value in normal mode for supported widgets', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'tokens-input' }
        ];
        const onUpdate = vi.fn();

        handleNormalInputMode({
            input: 'r',
            key: {},
            widgets,
            selectedIndex: 0,
            separatorChars: ['|', '-'],
            onBack: vi.fn(),
            onUpdate,
            setSelectedIndex: vi.fn(),
            setMoveMode: vi.fn(),
            setShowClearConfirm: vi.fn(),
            openWidgetPicker: vi.fn(),
            getCustomKeybindsForWidget: (widgetImpl, widget) => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds(widget) : [],
            setCustomEditorWidget: vi.fn()
        });

        const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[] | undefined;
        expect(updated?.[0]?.rawValue).toBe(true);
    });

    it('cycles separator character in normal mode', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'separator', character: '|' }
        ];
        const onUpdate = vi.fn();

        handleNormalInputMode({
            input: ' ',
            key: {},
            widgets,
            selectedIndex: 0,
            separatorChars: ['|', '-'],
            onBack: vi.fn(),
            onUpdate,
            setSelectedIndex: vi.fn(),
            setMoveMode: vi.fn(),
            setShowClearConfirm: vi.fn(),
            openWidgetPicker: vi.fn(),
            getCustomKeybindsForWidget: (widgetImpl, widget) => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds(widget) : [],
            setCustomEditorWidget: vi.fn()
        });

        const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[] | undefined;
        expect(updated?.[0]?.character).toBe('-');
    });

    it('applies custom widget keybind actions in normal mode', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'session-usage' }
        ];
        const onUpdate = vi.fn();

        handleNormalInputMode({
            input: 'p',
            key: {},
            widgets,
            selectedIndex: 0,
            separatorChars: ['|', '-'],
            onBack: vi.fn(),
            onUpdate,
            setSelectedIndex: vi.fn(),
            setMoveMode: vi.fn(),
            setShowClearConfirm: vi.fn(),
            openWidgetPicker: vi.fn(),
            getCustomKeybindsForWidget: (widgetImpl, widget) => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds(widget) : [],
            setCustomEditorWidget: vi.fn()
        });

        const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[] | undefined;
        expect(updated?.[0]?.metadata?.display).toBe('progress');
    });

    it('uses t to toggle reset timer date mode in normal mode', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'reset-timer' }
        ];
        const onUpdate = vi.fn();

        handleNormalInputMode({
            input: 't',
            key: {},
            widgets,
            selectedIndex: 0,
            separatorChars: ['|', '-'],
            onBack: vi.fn(),
            onUpdate,
            setSelectedIndex: vi.fn(),
            setMoveMode: vi.fn(),
            setShowClearConfirm: vi.fn(),
            openWidgetPicker: vi.fn(),
            getCustomKeybindsForWidget: (widgetImpl, widget) => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds(widget) : [],
            setCustomEditorWidget: vi.fn()
        });

        const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[] | undefined;
        expect(updated?.[0]?.metadata?.absolute).toBe('true');
    });

    it('uses h to toggle reset timer hour format in timestamp mode', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'reset-timer', metadata: { absolute: 'true' } }
        ];
        const onUpdate = vi.fn();

        handleNormalInputMode({
            input: 'h',
            key: {},
            widgets,
            selectedIndex: 0,
            separatorChars: ['|', '-'],
            onBack: vi.fn(),
            onUpdate,
            setSelectedIndex: vi.fn(),
            setMoveMode: vi.fn(),
            setShowClearConfirm: vi.fn(),
            openWidgetPicker: vi.fn(),
            getCustomKeybindsForWidget: (widgetImpl, widget) => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds(widget) : [],
            setCustomEditorWidget: vi.fn()
        });

        const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[] | undefined;
        expect(updated?.[0]?.metadata?.hour12).toBe('true');
    });

    it('opens custom editor for reset timer timezone action', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'reset-timer', metadata: { absolute: 'true' } }
        ];
        const onUpdate = vi.fn();
        const setCustomEditorWidget = vi.fn();

        handleNormalInputMode({
            input: 'z',
            key: {},
            widgets,
            selectedIndex: 0,
            separatorChars: ['|', '-'],
            onBack: vi.fn(),
            onUpdate,
            setSelectedIndex: vi.fn(),
            setMoveMode: vi.fn(),
            setShowClearConfirm: vi.fn(),
            openWidgetPicker: vi.fn(),
            getCustomKeybindsForWidget: (widgetImpl, widget) => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds(widget) : [],
            setCustomEditorWidget
        });

        expect(onUpdate).not.toHaveBeenCalled();
        const customEditorState = setCustomEditorWidget.mock.calls[0]?.[0] as
            | { action?: string; widget?: WidgetItem }
            | undefined;
        expect(customEditorState?.action).toBe('edit-timezone');
        expect(customEditorState?.widget?.type).toBe('reset-timer');
    });

    it('opens custom editor for reset timer locale action', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'reset-timer', metadata: { absolute: 'true' } }
        ];
        const onUpdate = vi.fn();
        const setCustomEditorWidget = vi.fn();

        handleNormalInputMode({
            input: 'l',
            key: {},
            widgets,
            selectedIndex: 0,
            separatorChars: ['|', '-'],
            onBack: vi.fn(),
            onUpdate,
            setSelectedIndex: vi.fn(),
            setMoveMode: vi.fn(),
            setShowClearConfirm: vi.fn(),
            openWidgetPicker: vi.fn(),
            getCustomKeybindsForWidget: (widgetImpl, widget) => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds(widget) : [],
            setCustomEditorWidget
        });

        expect(onUpdate).not.toHaveBeenCalled();
        const customEditorState = setCustomEditorWidget.mock.calls[0]?.[0] as
            | { action?: string; widget?: WidgetItem }
            | undefined;
        expect(customEditorState?.action).toBe('edit-locale');
        expect(customEditorState?.widget?.type).toBe('reset-timer');
    });

    it('uses v to cycle skills widget mode', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'skills' }
        ];
        const onUpdate = vi.fn();

        handleNormalInputMode({
            input: 'v',
            key: {},
            widgets,
            selectedIndex: 0,
            separatorChars: ['|', '-'],
            onBack: vi.fn(),
            onUpdate,
            setSelectedIndex: vi.fn(),
            setMoveMode: vi.fn(),
            setShowClearConfirm: vi.fn(),
            openWidgetPicker: vi.fn(),
            getCustomKeybindsForWidget: (widgetImpl, widget) => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds(widget) : [],
            setCustomEditorWidget: vi.fn()
        });

        const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[] | undefined;
        expect(updated?.[0]?.metadata?.mode).toBe('count');
    });

    it('opens custom editor for skills list limit action', () => {
        const widgets: WidgetItem[] = [
            { id: '1', type: 'skills', metadata: { mode: 'list' } }
        ];
        const onUpdate = vi.fn();
        const setCustomEditorWidget = vi.fn();

        handleNormalInputMode({
            input: 'l',
            key: {},
            widgets,
            selectedIndex: 0,
            separatorChars: ['|', '-'],
            onBack: vi.fn(),
            onUpdate,
            setSelectedIndex: vi.fn(),
            setMoveMode: vi.fn(),
            setShowClearConfirm: vi.fn(),
            openWidgetPicker: vi.fn(),
            getCustomKeybindsForWidget: (widgetImpl, widget) => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds(widget) : [],
            setCustomEditorWidget
        });

        expect(onUpdate).not.toHaveBeenCalled();
        const customEditorState = setCustomEditorWidget.mock.calls[0]?.[0] as
            | { action?: string; widget?: WidgetItem }
            | undefined;
        expect(customEditorState?.action).toBe('edit-list-limit');
        expect(customEditorState?.widget?.type).toBe('skills');
    });

    describe('k shortcut - clone widget', () => {
        it('inserts clone after source and moves selection to clone', () => {
            const widgets: WidgetItem[] = [
                { id: 'a', type: 'tokens-input' },
                { id: 'b', type: 'tokens-output' }
            ];
            const onUpdate = vi.fn();
            const setSelectedIndex = vi.fn();

            handleNormalInputMode({
                input: 'k',
                key: {},
                widgets,
                selectedIndex: 0,
                separatorChars: ['|', '-'],
                onBack: vi.fn(),
                onUpdate,
                setSelectedIndex,
                setMoveMode: vi.fn(),
                setShowClearConfirm: vi.fn(),
                openWidgetPicker: vi.fn(),
                getCustomKeybindsForWidget: vi.fn().mockReturnValue([]),
                setCustomEditorWidget: vi.fn()
            });

            const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[];
            expect(updated).toHaveLength(3);
            expect(updated[0]?.id).toBe('a');
            expect(updated[1]?.type).toBe('tokens-input');
            expect(updated[2]?.id).toBe('b');
            expect(setSelectedIndex).toHaveBeenCalledWith(1);
        });

        it('copies all primitive properties of source to clone', () => {
            const widgets: WidgetItem[] = [
                { id: 'src', type: 'tokens-input', color: 'green', bold: true, rawValue: true, backgroundColor: 'blue' }
            ];
            const onUpdate = vi.fn();

            handleNormalInputMode({
                input: 'k',
                key: {},
                widgets,
                selectedIndex: 0,
                separatorChars: ['|', '-'],
                onBack: vi.fn(),
                onUpdate,
                setSelectedIndex: vi.fn(),
                setMoveMode: vi.fn(),
                setShowClearConfirm: vi.fn(),
                openWidgetPicker: vi.fn(),
                getCustomKeybindsForWidget: vi.fn().mockReturnValue([]),
                setCustomEditorWidget: vi.fn()
            });

            const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[];
            const clone = updated[1];
            expect(clone?.color).toBe('green');
            expect(clone?.bold).toBe(true);
            expect(clone?.rawValue).toBe(true);
        });

        it('generates a different id for the clone', () => {
            const widgets: WidgetItem[] = [{ id: 'src', type: 'tokens-input' }];
            const onUpdate = vi.fn();

            handleNormalInputMode({
                input: 'k',
                key: {},
                widgets,
                selectedIndex: 0,
                separatorChars: ['|', '-'],
                onBack: vi.fn(),
                onUpdate,
                setSelectedIndex: vi.fn(),
                setMoveMode: vi.fn(),
                setShowClearConfirm: vi.fn(),
                openWidgetPicker: vi.fn(),
                getCustomKeybindsForWidget: vi.fn().mockReturnValue([]),
                setCustomEditorWidget: vi.fn()
            });

            const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[];
            expect(updated[1]?.id).not.toBe('src');
            expect(typeof updated[1]?.id).toBe('string');
            expect(updated[1]?.id.length).toBeGreaterThan(0);
        });

        it('shallow-clones metadata so mutating clone does not affect source', () => {
            const sourceMeta = { display: 'progress' };
            const widgets: WidgetItem[] = [{ id: 'src', type: 'session-usage', metadata: sourceMeta }];
            const onUpdate = vi.fn();

            handleNormalInputMode({
                input: 'k',
                key: {},
                widgets,
                selectedIndex: 0,
                separatorChars: ['|', '-'],
                onBack: vi.fn(),
                onUpdate,
                setSelectedIndex: vi.fn(),
                setMoveMode: vi.fn(),
                setShowClearConfirm: vi.fn(),
                openWidgetPicker: vi.fn(),
                getCustomKeybindsForWidget: vi.fn().mockReturnValue([]),
                setCustomEditorWidget: vi.fn()
            });

            const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[];
            const cloneMeta = updated[1]?.metadata as Record<string, unknown> | undefined;
            expect(cloneMeta).toBeDefined();
            expect(cloneMeta).not.toBe(sourceMeta);
            expect(cloneMeta?.display).toBe('progress');

            if (cloneMeta) {
                cloneMeta.display = 'changed';
            }
            expect(sourceMeta.display).toBe('progress');
        });

        it('uses getUniqueBackgroundColor result as backgroundColor in powerline mode', () => {
            const widgets: WidgetItem[] = [{ id: 'src', type: 'tokens-input', backgroundColor: 'red' }];
            const onUpdate = vi.fn();

            handleNormalInputMode({
                input: 'k',
                key: {},
                widgets,
                selectedIndex: 0,
                separatorChars: ['|', '-'],
                onBack: vi.fn(),
                onUpdate,
                setSelectedIndex: vi.fn(),
                setMoveMode: vi.fn(),
                setShowClearConfirm: vi.fn(),
                openWidgetPicker: vi.fn(),
                getCustomKeybindsForWidget: vi.fn().mockReturnValue([]),
                setCustomEditorWidget: vi.fn(),
                getUniqueBackgroundColor: () => 'cyan'
            });

            const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[];
            expect(updated[1]?.backgroundColor).toBe('cyan');
        });

        it('preserves source backgroundColor when getUniqueBackgroundColor returns undefined', () => {
            const widgets: WidgetItem[] = [{ id: 'src', type: 'tokens-input', backgroundColor: 'red' }];
            const onUpdate = vi.fn();

            handleNormalInputMode({
                input: 'k',
                key: {},
                widgets,
                selectedIndex: 0,
                separatorChars: ['|', '-'],
                onBack: vi.fn(),
                onUpdate,
                setSelectedIndex: vi.fn(),
                setMoveMode: vi.fn(),
                setShowClearConfirm: vi.fn(),
                openWidgetPicker: vi.fn(),
                getCustomKeybindsForWidget: vi.fn().mockReturnValue([]),
                setCustomEditorWidget: vi.fn(),
                getUniqueBackgroundColor: () => undefined
            });

            const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[];
            expect(updated[1]?.backgroundColor).toBe('red');
        });

        it('does nothing when widget list is empty', () => {
            const onUpdate = vi.fn();
            const setSelectedIndex = vi.fn();

            handleNormalInputMode({
                input: 'k',
                key: {},
                widgets: [],
                selectedIndex: 0,
                separatorChars: ['|', '-'],
                onBack: vi.fn(),
                onUpdate,
                setSelectedIndex,
                setMoveMode: vi.fn(),
                setShowClearConfirm: vi.fn(),
                openWidgetPicker: vi.fn(),
                getCustomKeybindsForWidget: vi.fn().mockReturnValue([]),
                setCustomEditorWidget: vi.fn()
            });

            expect(onUpdate).not.toHaveBeenCalled();
            expect(setSelectedIndex).not.toHaveBeenCalled();
        });
    });
});
