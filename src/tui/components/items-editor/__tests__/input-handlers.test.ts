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
            getVisibleCustomKeybinds: widgetImpl => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds() : [],
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
            getVisibleCustomKeybinds: widgetImpl => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds() : [],
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
            getVisibleCustomKeybinds: widgetImpl => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds() : [],
            setCustomEditorWidget: vi.fn()
        });

        const updated = onUpdate.mock.calls[0]?.[0] as WidgetItem[] | undefined;
        expect(updated?.[0]?.metadata?.display).toBe('progress');
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
            getVisibleCustomKeybinds: widgetImpl => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds() : [],
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
            getVisibleCustomKeybinds: widgetImpl => widgetImpl.getCustomKeybinds ? widgetImpl.getCustomKeybinds() : [],
            setCustomEditorWidget
        });

        expect(onUpdate).not.toHaveBeenCalled();
        const customEditorState = setCustomEditorWidget.mock.calls[0]?.[0] as
            | { action?: string; widget?: WidgetItem }
            | undefined;
        expect(customEditorState?.action).toBe('edit-list-limit');
        expect(customEditorState?.widget?.type).toBe('skills');
    });
});