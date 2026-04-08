import type {
    CustomKeybind,
    Widget,
    WidgetItem,
    WidgetItemType
} from '../../../types/Widget';
import {
    filterWidgetCatalog,
    getWidget,
    type WidgetCatalogEntry
} from '../../../utils/widgets';

export type WidgetPickerAction = 'change' | 'add' | 'insert';
export type WidgetPickerLevel = 'category' | 'widget';

export interface WidgetPickerState {
    action: WidgetPickerAction;
    level: WidgetPickerLevel;
    selectedCategory: string | null;
    categoryQuery: string;
    widgetQuery: string;
    selectedType: WidgetItemType | null;
}

export interface CustomEditorWidgetState {
    widget: WidgetItem;
    impl: Widget;
    action?: string;
}

export interface InputKey {
    ctrl?: boolean;
    meta?: boolean;
    tab?: boolean;
    shift?: boolean;
    upArrow?: boolean;
    downArrow?: boolean;
    leftArrow?: boolean;
    rightArrow?: boolean;
    return?: boolean;
    escape?: boolean;
    backspace?: boolean;
    delete?: boolean;
}

type Setter<T> = (value: T | ((prev: T) => T)) => void;

function setPickerState(
    setWidgetPicker: Setter<WidgetPickerState | null>,
    normalizeState: (state: WidgetPickerState) => WidgetPickerState,
    updater: (prev: WidgetPickerState) => WidgetPickerState
): void {
    setWidgetPicker((prev) => {
        if (!prev) {
            return prev;
        }

        return normalizeState(updater(prev));
    });
}

function getPickerCategories(widgetCategories: string[]): string[] {
    return [...widgetCategories];
}

export function normalizePickerState(
    state: WidgetPickerState,
    widgetCatalog: WidgetCatalogEntry[],
    widgetCategories: string[]
): WidgetPickerState {
    const filteredCategories = getPickerCategories(widgetCategories);
    const selectedCategory = state.selectedCategory && filteredCategories.includes(state.selectedCategory)
        ? state.selectedCategory
        : (filteredCategories[0] ?? null);

    const hasTopLevelSearch = state.level === 'category' && state.categoryQuery.trim().length > 0;
    const effectiveCategory = hasTopLevelSearch ? 'All' : (selectedCategory ?? 'All');
    const effectiveQuery = hasTopLevelSearch ? state.categoryQuery : state.widgetQuery;
    const filteredWidgets = filterWidgetCatalog(widgetCatalog, effectiveCategory, effectiveQuery);
    const hasSelectedType = state.selectedType
        ? filteredWidgets.some(entry => entry.type === state.selectedType)
        : false;

    return {
        ...state,
        selectedCategory,
        selectedType: hasSelectedType ? state.selectedType : (filteredWidgets[0]?.type ?? null)
    };
}

interface PickerViewState {
    filteredCategories: string[];
    selectedCategory: string | null;
    hasTopLevelSearch: boolean;
    topLevelSearchEntries: WidgetCatalogEntry[];
    topLevelSelectedEntry: WidgetCatalogEntry | undefined;
    filteredWidgets: WidgetCatalogEntry[];
    selectedEntry: WidgetCatalogEntry | undefined;
}

function getPickerViewState(
    widgetPicker: WidgetPickerState,
    widgetCatalog: WidgetCatalogEntry[],
    widgetCategories: string[]
): PickerViewState {
    const filteredCategories = getPickerCategories(widgetCategories);
    const selectedCategory = widgetPicker.selectedCategory && filteredCategories.includes(widgetPicker.selectedCategory)
        ? widgetPicker.selectedCategory
        : (filteredCategories[0] ?? null);
    const hasTopLevelSearch = widgetPicker.level === 'category' && widgetPicker.categoryQuery.trim().length > 0;
    const topLevelSearchEntries = hasTopLevelSearch
        ? filterWidgetCatalog(widgetCatalog, 'All', widgetPicker.categoryQuery)
        : [];
    const topLevelSelectedEntry = topLevelSearchEntries.find(entry => entry.type === widgetPicker.selectedType) ?? topLevelSearchEntries[0];
    const filteredWidgets = filterWidgetCatalog(widgetCatalog, selectedCategory ?? 'All', widgetPicker.widgetQuery);
    const selectedEntry = filteredWidgets.find(entry => entry.type === widgetPicker.selectedType) ?? filteredWidgets[0];

    return {
        filteredCategories,
        selectedCategory,
        hasTopLevelSearch,
        topLevelSearchEntries,
        topLevelSelectedEntry,
        filteredWidgets,
        selectedEntry
    };
}

export interface HandlePickerInputModeArgs {
    input: string;
    key: InputKey;
    widgetPicker: WidgetPickerState;
    widgetCatalog: WidgetCatalogEntry[];
    widgetCategories: string[];
    setWidgetPicker: Setter<WidgetPickerState | null>;
    applyWidgetPickerSelection: (selectedType: WidgetItemType) => void;
}

export function handlePickerInputMode({
    input,
    key,
    widgetPicker,
    widgetCatalog,
    widgetCategories,
    setWidgetPicker,
    applyWidgetPickerSelection
}: HandlePickerInputModeArgs): void {
    const normalizeState = (state: WidgetPickerState) => normalizePickerState(state, widgetCatalog, widgetCategories);
    const {
        filteredCategories,
        selectedCategory,
        hasTopLevelSearch,
        topLevelSearchEntries,
        topLevelSelectedEntry,
        filteredWidgets,
        selectedEntry
    } = getPickerViewState(widgetPicker, widgetCatalog, widgetCategories);

    if (widgetPicker.level === 'category') {
        if (key.escape) {
            if (widgetPicker.categoryQuery.length > 0) {
                setPickerState(setWidgetPicker, normalizeState, prev => ({
                    ...prev,
                    categoryQuery: ''
                }));
            } else {
                setWidgetPicker(null);
            }
        } else if (key.return) {
            if (hasTopLevelSearch) {
                if (topLevelSelectedEntry) {
                    applyWidgetPickerSelection(topLevelSelectedEntry.type);
                }
            } else if (selectedCategory) {
                setPickerState(setWidgetPicker, normalizeState, prev => ({
                    ...prev,
                    level: 'widget',
                    selectedCategory
                }));
            }
        } else if (key.upArrow || key.downArrow) {
            if (hasTopLevelSearch) {
                if (topLevelSearchEntries.length === 0) {
                    return;
                }

                let currentIndex = topLevelSearchEntries.findIndex(entry => entry.type === widgetPicker.selectedType);
                if (currentIndex === -1) {
                    currentIndex = 0;
                }

                const nextIndex = key.downArrow
                    ? Math.min(topLevelSearchEntries.length - 1, currentIndex + 1)
                    : Math.max(0, currentIndex - 1);
                const nextType = topLevelSearchEntries[nextIndex]?.type ?? null;
                setPickerState(setWidgetPicker, normalizeState, prev => ({
                    ...prev,
                    selectedType: nextType
                }));
            } else {
                if (filteredCategories.length === 0) {
                    return;
                }

                let currentIndex = filteredCategories.findIndex(category => category === selectedCategory);
                if (currentIndex === -1) {
                    currentIndex = 0;
                }

                const nextIndex = key.downArrow
                    ? Math.min(filteredCategories.length - 1, currentIndex + 1)
                    : Math.max(0, currentIndex - 1);
                const nextCategory = filteredCategories[nextIndex] ?? null;
                setPickerState(setWidgetPicker, normalizeState, prev => ({
                    ...prev,
                    selectedCategory: nextCategory
                }));
            }
        } else if (key.backspace || key.delete) {
            setPickerState(setWidgetPicker, normalizeState, prev => ({
                ...prev,
                categoryQuery: prev.categoryQuery.slice(0, -1),
                selectedType: null
            }));
        } else if (
            input
            && !key.ctrl
            && !key.meta
            && !key.tab
        ) {
            setPickerState(setWidgetPicker, normalizeState, prev => ({
                ...prev,
                categoryQuery: prev.categoryQuery + input,
                selectedType: null
            }));
        }
    } else {
        if (key.escape) {
            if (widgetPicker.widgetQuery.length > 0) {
                setPickerState(setWidgetPicker, normalizeState, prev => ({
                    ...prev,
                    widgetQuery: ''
                }));
            } else {
                setPickerState(setWidgetPicker, normalizeState, prev => ({
                    ...prev,
                    level: 'category'
                }));
            }
        } else if (key.return) {
            if (selectedEntry) {
                applyWidgetPickerSelection(selectedEntry.type);
            }
        } else if (key.upArrow || key.downArrow) {
            if (filteredWidgets.length === 0) {
                return;
            }

            let currentIndex = filteredWidgets.findIndex(entry => entry.type === widgetPicker.selectedType);
            if (currentIndex === -1) {
                currentIndex = 0;
            }

            const nextIndex = key.downArrow
                ? Math.min(filteredWidgets.length - 1, currentIndex + 1)
                : Math.max(0, currentIndex - 1);
            const nextType = filteredWidgets[nextIndex]?.type ?? null;
            setPickerState(setWidgetPicker, normalizeState, prev => ({
                ...prev,
                selectedType: nextType
            }));
        } else if (key.backspace || key.delete) {
            setPickerState(setWidgetPicker, normalizeState, prev => ({
                ...prev,
                widgetQuery: prev.widgetQuery.slice(0, -1),
                selectedType: null
            }));
        } else if (
            input
            && !key.ctrl
            && !key.meta
            && !key.tab
        ) {
            setPickerState(setWidgetPicker, normalizeState, prev => ({
                ...prev,
                widgetQuery: prev.widgetQuery + input,
                selectedType: null
            }));
        }
    }
}

export interface HandleMoveInputModeArgs {
    key: InputKey;
    widgets: WidgetItem[];
    selectedIndex: number;
    onUpdate: (widgets: WidgetItem[]) => void;
    setSelectedIndex: (index: number) => void;
    setMoveMode: (moveMode: boolean) => void;
}

export function handleMoveInputMode({
    key,
    widgets,
    selectedIndex,
    onUpdate,
    setSelectedIndex,
    setMoveMode
}: HandleMoveInputModeArgs): void {
    if (key.upArrow && selectedIndex > 0) {
        const newWidgets = [...widgets];
        const temp = newWidgets[selectedIndex];
        const prev = newWidgets[selectedIndex - 1];
        if (temp && prev) {
            [newWidgets[selectedIndex], newWidgets[selectedIndex - 1]] = [prev, temp];
        }
        onUpdate(newWidgets);
        setSelectedIndex(selectedIndex - 1);
    } else if (key.downArrow && selectedIndex < widgets.length - 1) {
        const newWidgets = [...widgets];
        const temp = newWidgets[selectedIndex];
        const next = newWidgets[selectedIndex + 1];
        if (temp && next) {
            [newWidgets[selectedIndex], newWidgets[selectedIndex + 1]] = [next, temp];
        }
        onUpdate(newWidgets);
        setSelectedIndex(selectedIndex + 1);
    } else if (key.escape || key.return) {
        setMoveMode(false);
    }
}

export interface HandleNormalInputModeArgs {
    input: string;
    key: InputKey;
    widgets: WidgetItem[];
    selectedIndex: number;
    separatorChars: string[];
    onBack: () => void;
    onUpdate: (widgets: WidgetItem[]) => void;
    setSelectedIndex: (index: number) => void;
    setMoveMode: (moveMode: boolean) => void;
    setShowClearConfirm: (show: boolean) => void;
    openWidgetPicker: (action: WidgetPickerAction) => void;
    getCustomKeybindsForWidget: (widgetImpl: Widget, widget: WidgetItem) => CustomKeybind[];
    setCustomEditorWidget: (state: CustomEditorWidgetState | null) => void;
}

export function handleNormalInputMode({
    input,
    key,
    widgets,
    selectedIndex,
    separatorChars,
    onBack,
    onUpdate,
    setSelectedIndex,
    setMoveMode,
    setShowClearConfirm,
    openWidgetPicker,
    getCustomKeybindsForWidget,
    setCustomEditorWidget
}: HandleNormalInputModeArgs): void {
    if (key.upArrow && widgets.length > 0) {
        setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow && widgets.length > 0) {
        setSelectedIndex(Math.min(widgets.length - 1, selectedIndex + 1));
    } else if (key.leftArrow && widgets.length > 0) {
        openWidgetPicker('change');
    } else if (key.rightArrow && widgets.length > 0) {
        openWidgetPicker('change');
    } else if (key.return && widgets.length > 0) {
        setMoveMode(true);
    } else if (input === 'a') {
        openWidgetPicker('add');
    } else if (input === 'i') {
        openWidgetPicker('insert');
    } else if (input === 'd' && widgets.length > 0) {
        const newWidgets = widgets.filter((_, i) => i !== selectedIndex);
        onUpdate(newWidgets);
        if (selectedIndex >= newWidgets.length && selectedIndex > 0) {
            setSelectedIndex(selectedIndex - 1);
        }
    } else if (input === 'c') {
        if (widgets.length > 0) {
            setShowClearConfirm(true);
        }
    } else if (input === ' ' && widgets.length > 0) {
        const currentWidget = widgets[selectedIndex];
        if (currentWidget?.type === 'separator') {
            const currentChar = currentWidget.character ?? '|';
            const currentCharIndex = separatorChars.indexOf(currentChar);
            const nextChar = separatorChars[(currentCharIndex + 1) % separatorChars.length];
            const newWidgets = [...widgets];
            newWidgets[selectedIndex] = { ...currentWidget, character: nextChar };
            onUpdate(newWidgets);
        }
    } else if (input === 'r' && widgets.length > 0) {
        const currentWidget = widgets[selectedIndex];
        if (currentWidget && currentWidget.type !== 'separator' && currentWidget.type !== 'flex-separator') {
            const widgetImpl = getWidget(currentWidget.type);
            if (!widgetImpl?.supportsRawValue()) {
                return;
            }
            const newWidgets = [...widgets];
            newWidgets[selectedIndex] = { ...currentWidget, rawValue: !currentWidget.rawValue };
            onUpdate(newWidgets);
        }
    } else if (input === 'm' && widgets.length > 0) {
        const currentWidget = widgets[selectedIndex];
        if (currentWidget && selectedIndex < widgets.length - 1
            && currentWidget.type !== 'separator' && currentWidget.type !== 'flex-separator') {
            const newWidgets = [...widgets];
            let nextMergeState: boolean | 'no-padding' | undefined;

            if (currentWidget.merge === undefined) {
                nextMergeState = true;
            } else if (currentWidget.merge === true) {
                nextMergeState = 'no-padding';
            } else {
                nextMergeState = undefined;
            }

            if (nextMergeState === undefined) {
                const { merge, ...rest } = currentWidget;
                void merge; // Intentionally unused
                newWidgets[selectedIndex] = rest;
            } else {
                newWidgets[selectedIndex] = { ...currentWidget, merge: nextMergeState };
            }
            onUpdate(newWidgets);
        }
    } else if (key.escape) {
        onBack();
    } else if (widgets.length > 0) {
        const currentWidget = widgets[selectedIndex];
        if (currentWidget && currentWidget.type !== 'separator' && currentWidget.type !== 'flex-separator') {
            const widgetImpl = getWidget(currentWidget.type);
            if (!widgetImpl?.getCustomKeybinds) {
                return;
            }

            const customKeybinds = getCustomKeybindsForWidget(widgetImpl, currentWidget);
            const matchedKeybind = customKeybinds.find(kb => kb.key === input);

            if (matchedKeybind && !key.ctrl) {
                if (widgetImpl.handleEditorAction) {
                    const updatedWidget = widgetImpl.handleEditorAction(matchedKeybind.action, currentWidget);
                    if (updatedWidget) {
                        const newWidgets = [...widgets];
                        newWidgets[selectedIndex] = updatedWidget;
                        onUpdate(newWidgets);
                    } else if (widgetImpl.renderEditor) {
                        setCustomEditorWidget({ widget: currentWidget, impl: widgetImpl, action: matchedKeybind.action });
                    }
                } else if (widgetImpl.renderEditor) {
                    setCustomEditorWidget({ widget: currentWidget, impl: widgetImpl, action: matchedKeybind.action });
                }
            }
        }
    }
}