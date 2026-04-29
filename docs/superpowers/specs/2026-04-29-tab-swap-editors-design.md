# Tab-Swap Between ItemsEditor and ColorMenu

## Summary

Add Tab key navigation to swap directly between ItemsEditor and ColorMenu without returning to the main menu. Both editors remain fully independent — Tab is a shortcut, not a mode merge. Widget cursor position is preserved across swaps.

## Motivation

Currently, switching between editing widget structure and editing widget colors requires: Editor → Escape → LineSelector → Main Menu → other menu item → LineSelector → other Editor. Tab-swap reduces this to a single keypress while preserving cursor position on the same widget.

## Design

### Navigation Model

Tab performs a full context switch between editors. Once in the target editor, it behaves identically to having entered through the main menu. Escape goes to that editor's own LineSelector, not back to the editor you Tabbed from. Tab again returns you to the other editor.

The line context is already established before Tab is available — both editors operate on the same `selectedLine`. Tab never involves LineSelector.

### State Management (App.tsx)

New state for widget position tracking, separate from `menuSelections` (which is `Record<string, number>` and stores menu indices — a widget ID is a string, not an index):

- `activeWidgetId: string | null` — new `useState` tracking the currently highlighted widget ID, updated by both editors on cursor movement
- `handleWidgetHighlight(widgetId: string)` callback updates `activeWidgetId`
- `handleTabSwap()` callback toggles `screen` between `'items'` and `'colors'`

Both editor screen blocks pass:
- `onTabSwap={handleTabSwap}`
- `onWidgetHighlight={handleWidgetHighlight}`
- `initialWidgetId={activeWidgetId}`

All existing wiring (`onBack`, `onUpdate`, `selectedLine`, `menuSelections`) remains unchanged.

### ItemsEditor Changes

New props:
- `onTabSwap: () => void`
- `onWidgetHighlight: (widgetId: string) => void`
- `initialWidgetId?: string`

Behavior:
- On mount, if `initialWidgetId` is provided, sets `selectedIndex` to the index of that widget in the `widgets` array (falls back to first item if not found)
- On cursor movement, calls `onWidgetHighlight(widgetId)` with the current widget's ID
- On Tab press, checks if the current widget is colorable. Separator and flex-separator types are not registered widgets, so check the type first — if it's a separator, Tab is unavailable. Otherwise, use `getWidget(type)?.supportsColors(widget)` to determine colorability. If colorable, calls `onTabSwap()`. If not, does nothing.
- Tab is only handled in normal mode. Sub-modes (move mode, widget picker, custom editor, clear-confirm dialog) have early returns in `useInput` that prevent Tab from reaching normal input handling. Tab handling goes in `handleNormalInputMode` in `input-handlers.ts`, after the existing sub-mode guards.
- Help text always shows the Tab hint. The hint is grayed out when the current widget is not colorable.

### ColorMenu Changes

New props:
- `onTabSwap: () => void`
- `onWidgetHighlight: (widgetId: string) => void`
- `initialWidgetId?: string`

Behavior:
- On mount, if `initialWidgetId` is provided, sets `highlightedItemId` to that ID (falls back to first colorable widget if not found). The `initialWidgetId` is translated to an `initialIndex` for the `SelectInput` component, or the existing `key` prop mechanism forces a re-mount to position correctly.
- On cursor movement, calls `onWidgetHighlight(widgetId)` with the current widget's ID
- On Tab press, calls `onTabSwap()` (always available — every widget in ColorMenu's filtered list is colorable by definition, since the list is pre-filtered via `supportsColors(item: WidgetItem)`)
- Tab is only handled in normal mode. Sub-modes (hex input, ansi256 input, clear-confirm dialog) have early returns in `useInput` that prevent Tab from firing during text entry.
- Help text shows the Tab hint
- Existing Tab guards in `handlePickerInputMode` (input-handlers.ts) already filter Tab from widget picker search fields — no additional work needed there.

### Tab Availability

Tab is only available when:
- The current screen is `'items'` or `'colors'`
- In ItemsEditor: the currently selected widget supports colors (`supportsColors()` returns true)
- In ColorMenu: always available (list is pre-filtered to colorable widgets via `supportsColors(item: WidgetItem)`)

When Tab is unavailable (non-colorable widget in ItemsEditor), the Tab hint in the help text is displayed but grayed out. Tab key input is ignored.

When the line has no colorable widgets at all, Tab is disabled entirely in ItemsEditor. Normal editing applies.

### Edge Cases

- **No colorable widgets on the line:** Tab is disabled in ItemsEditor (grayed hint, no action). ColorMenu is still reachable via the main menu where it handles empty state normally.
- **Widget added or deleted between swaps:** If a widget is deleted in ItemsEditor and the user then Tabs to ColorMenu, `activeWidgetId` references a widget that no longer exists. Both editors handle this gracefully via their fallback behavior (first item in list). This is a defensive fallback — in practice, the cursor will have already moved to a different widget after deletion, updating `activeWidgetId` before Tab can be pressed.
- **Settings consistency across swaps:** Both editors share the same `selectedLine` and `widgets` array from App state. Changes made in one editor (e.g., adding a widget in ItemsEditor) are reflected when Tabbing to the other because App owns the settings state.

## Files Modified

- `src/tui/App.tsx` — add `activeWidgetId` state, `handleTabSwap`, `handleWidgetHighlight`, pass new props to both editors
- `src/tui/components/ItemsEditor.tsx` — add `onTabSwap`, `onWidgetHighlight`, `initialWidgetId` props; help text update
- `src/tui/components/items-editor/input-handlers.ts` — add Tab keybind to `handleNormalInputMode`; pass `onTabSwap` through handler args
- `src/tui/components/ColorMenu.tsx` — add `onTabSwap`, `onWidgetHighlight`, `initialWidgetId` props; Tab keybind; help text

## Testing

### Unit Tests

- ItemsEditor: Tab calls `onTabSwap` when widget is colorable, does nothing when not
- ItemsEditor: `initialWidgetId` sets correct `selectedIndex` on mount
- ColorMenu: Tab calls `onTabSwap`
- ColorMenu: `initialWidgetId` sets correct `highlightedItemId` on mount
- Both: `onWidgetHighlight` called on cursor movement with correct widget ID

### Integration Tests (App level)

- Tab on `items` screen switches to `colors` screen
- Tab on `colors` screen switches to `items` screen
- Widget position is preserved across the swap
- Tab does nothing on non-editor screens

### Manual Testing

- Tab-swap flow feels seamless — position preservation, no flicker
- Help text shows Tab hint, grayed when not available
- Escape from each editor goes to its own LineSelector regardless of how entry occurred
- Main menu flows unchanged — both Edit Lines and Edit Colors work as before
