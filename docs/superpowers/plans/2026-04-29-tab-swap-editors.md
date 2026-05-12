# Tab-Swap Between ItemsEditor and ColorMenu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to press Tab to switch between ItemsEditor and ColorMenu without returning to the main menu, preserving widget cursor position across swaps.

**Architecture:** App.tsx gains a new `activeWidgetId` state and a `handleTabSwap` callback that toggles screen between `'items'` and `'colors'`. Both editors receive the widget ID as `initialWidgetId` and report cursor changes via `onWidgetHighlight`. Tab handling is added to `handleNormalInputMode` in input-handlers.ts (ItemsEditor) and directly in ColorMenu's `useInput`.

**Tech Stack:** React, Ink, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-04-29-tab-swap-editors-design.md`

---

## File Map

| File | Change | Responsibility |
|------|--------|---------------|
| `src/tui/App.tsx` | Modify | Add `activeWidgetId` state, `handleTabSwap`, `handleWidgetHighlight`; pass new props to both editors |
| `src/tui/components/items-editor/input-handlers.ts` | Modify | Add `onTabSwap` to `HandleNormalInputModeArgs`; handle Tab key in `handleNormalInputMode` |
| `src/tui/components/ItemsEditor.tsx` | Modify | Add new props to interface; pass `onTabSwap` through to handler; wire `initialWidgetId` on mount; call `onWidgetHighlight` on cursor change; update help text |
| `src/tui/components/ColorMenu.tsx` | Modify | Add new props to interface; wire `initialWidgetId` to `highlightedItemId` and `SelectInput`; handle Tab in `useInput`; call `onWidgetHighlight` on cursor change; update help text |
| `src/tui/components/items-editor/__tests__/input-handlers.test.ts` | Modify | Add tests for Tab keybind in normal mode |
| `src/tui/__tests__/App.test.ts` | Modify | Add tests for `handleTabSwap` screen toggle logic |

---

## Task 1: Add `activeWidgetId` state and Tab-swap callback to App.tsx

**Goal:** Establish the App-level state and callbacks that both editors will use for position tracking and screen switching.

**Files:** `src/tui/App.tsx`

**What to build:**
- New `useState<string | null>` for `activeWidgetId`, separate from `menuSelections` (which is `Record<string, number>` for menu indices)
- `handleWidgetHighlight` callback that updates `activeWidgetId`
- `handleTabSwap` callback that toggles `screen` between `'items'` and `'colors'`
- Pass `onTabSwap`, `onWidgetHighlight`, and `initialWidgetId` props to both the `ItemsEditor` and `ColorMenu` screen blocks

**Constraints:**
- `handleTabSwap` must only toggle between `'items'` and `'colors'` — no other screens
- The existing `onBack`, `onUpdate`, `selectedLine`, and `menuSelections` wiring must remain unchanged
- Both editors already share the same `selectedLine` and `widgets` array — this just adds the widget-level position tracking on top

**Acceptance criteria:**
- [ ] `activeWidgetId` state exists and is passed to both editors as `initialWidgetId`
- [ ] `handleTabSwap` toggles screen between `'items'` and `'colors'`
- [ ] `handleWidgetHighlight` updates `activeWidgetId`
- [ ] All existing navigation (main menu, LineSelector, back) continues to work
- [ ] TypeScript compiles without errors
- [ ] Commit

---

## Task 2: Add Tab keybind to input-handlers.ts

**Goal:** Handle Tab key press in `handleNormalInputMode` so that ItemsEditor can trigger a swap to ColorMenu when the current widget is colorable.

**Files:** `src/tui/components/items-editor/input-handlers.ts`

**What to build:**
- Add `onTabSwap` as an optional callback to `HandleNormalInputModeArgs` interface
- In `handleNormalInputMode`, add Tab key handling: when `key.tab` is pressed and the current widget supports colors, call `onTabSwap()`
- Tab check must account for separator and flex-separator types which are not registered widgets — check the type string first, then use `getWidget(type)?.supportsColors(widget)`

**Constraints:**
- Tab must only fire in normal mode. The existing early returns for move mode, widget picker, custom editor, and clear-confirm in `useInput` (in ItemsEditor.tsx) already prevent this — Tab is added inside `handleNormalInputMode` which is only called from the normal-mode branch
- Existing `!key.tab` guards in `handlePickerInputMode` (lines 230, 283) already filter Tab from search input — no changes needed there
- `onTabSwap` should be optional in the interface so existing callers don't break before they're updated

**Acceptance criteria:**
- [ ] `HandleNormalInputModeArgs` includes optional `onTabSwap`
- [ ] Tab calls `onTabSwap` when current widget is colorable
- [ ] Tab does nothing when current widget is not colorable (separator, flex-separator, or `supportsColors` returns false)
- [ ] Tab does nothing when `onTabSwap` is not provided
- [ ] TypeScript compiles without errors
- [ ] Commit

---

## Task 3: Wire Tab-swap props into ItemsEditor

**Goal:** Connect ItemsEditor to the App-level Tab-swap infrastructure — initial position, cursor tracking, and Tab forwarding.

**Files:** `src/tui/components/ItemsEditor.tsx`

**What to build:**
- Add `onTabSwap`, `onWidgetHighlight`, and `initialWidgetId` to `ItemsEditorProps` interface
- On mount only, use `initialWidgetId` to derive the initial value for `selectedIndex` (find the index of the matching widget in the `widgets` array, fall back to first item if not found). Do not re-position on subsequent renders — `initialWidgetId` is only used for the initial mount to avoid a feedback loop (since `onWidgetHighlight` updates `activeWidgetId` in App, which flows back as `initialWidgetId`).
- Track cursor position with a `useEffect` on `[selectedIndex, widgets]` that calls `onWidgetHighlight` with the current widget's ID. This is a single centralized call site rather than scattering `onWidgetHighlight` calls at each place `selectedIndex` is mutated (up/down navigation, add/delete/clone, picker selection).
- Pass `onTabSwap` through to `handleNormalInputMode` in the `useInput` handler
- Update help text to include a Tab hint. The hint should be grayed out (dimColor) when the current widget is not colorable, and normal when it is.

**Constraints:**
- The `useEffect` approach for `onWidgetHighlight` means no changes needed inside input-handlers.ts or any other mutation site — the effect fires automatically whenever `selectedIndex` or `widgets` changes
- The help text Tab hint visibility logic must match the same colorability check used in input-handlers.ts (separator/flex-separator type check, then `getWidget(type)?.supportsColors(widget)`)
- All new props should be optional to avoid breaking existing usage patterns

**Acceptance criteria:**
- [ ] `initialWidgetId` correctly positions cursor on mount
- [ ] Cursor changes trigger `onWidgetHighlight` with the widget ID
- [ ] Tab hint appears in help text, grayed when not available
- [ ] Existing ItemsEditor behavior unchanged (all keybinds, back navigation, widget editing)
- [ ] TypeScript compiles without errors
- [ ] Commit

---

## Task 4: Wire Tab-swap props into ColorMenu

**Goal:** Connect ColorMenu to the App-level Tab-swap infrastructure — initial position, cursor tracking, and Tab key handling.

**Files:** `src/tui/components/ColorMenu.tsx`

**What to build:**
- Add `onTabSwap`, `onWidgetHighlight`, and `initialWidgetId` to `ColorMenuProps` interface
- On mount, if `initialWidgetId` is provided, set `highlightedItemId` to that ID. Ensure the `SelectInput` component renders with the correct initial position — the existing `key` prop mechanism (`key={showSeparators-${highlightedItemId}}`) will force a re-mount, and the `initialIndex` prop should be derived from the widget ID.
- Call `onWidgetHighlight` with the current widget's ID when the highlighted item changes (in the `onHighlight` callback of `SelectInput`)
- Handle Tab in `useInput`: call `onTabSwap()`. Tab is always available in ColorMenu because the list is pre-filtered to colorable widgets.
- Tab must be blocked during sub-modes: hex input, ansi256 input, and clear-confirm dialog all have early returns in `useInput` that prevent Tab from firing — verify Tab handling is placed after those guards.
- Update help text to include a Tab hint (always active, never grayed — all items in ColorMenu are colorable)

**Constraints:**
- ColorMenu uses `SelectInput` from ink-select-input, which manages its own cursor state. The `initialWidgetId` must be translated to an `initialIndex` for `SelectInput` positioning.
- If `initialWidgetId` doesn't match any widget in the colorable list, fall back to the first colorable widget.
- All new props should be optional to avoid breaking existing usage.

**Acceptance criteria:**
- [ ] `initialWidgetId` correctly positions the highlighted item on mount
- [ ] Cursor changes trigger `onWidgetHighlight` with the widget ID
- [ ] Tab calls `onTabSwap`
- [ ] Tab is blocked during hex input, ansi256 input, and clear-confirm modes
- [ ] Tab hint appears in help text
- [ ] Existing ColorMenu behavior unchanged (all keybinds, color cycling, back navigation)
- [ ] TypeScript compiles without errors
- [ ] Commit

---

## Task 5: Add tests for Tab keybind in input-handlers

**Goal:** Verify Tab key behavior in handleNormalInputMode — calls onTabSwap for colorable widgets, does nothing for non-colorable widgets.

**Files:** `src/tui/components/items-editor/__tests__/input-handlers.test.ts`

**What to build:**
- Test that Tab calls `onTabSwap` when the current widget is a colorable type (e.g., model widget)
- Test that Tab does NOT call `onTabSwap` when the current widget is a separator
- Test that Tab does NOT call `onTabSwap` when the current widget is a flex-separator
- Test that Tab does nothing when `onTabSwap` is not provided (optional prop)

**Constraints:**
- Follow the existing test patterns in this file — the tests use mock objects for args with `vi.fn()` callbacks, and test individual handler functions directly
- Widget types for test data should use real registered widget types from the widget registry

**Acceptance criteria:**
- [ ] All new tests pass
- [ ] Existing tests still pass
- [ ] Commit

---

## Task 6: Add tests for App-level Tab-swap logic

**Goal:** Verify the handleTabSwap screen toggle works correctly.

**Files:** `src/tui/__tests__/App.test.ts`

**What to build:**
- The existing App tests test exported pure functions (`getConfirmCancelScreen`, `clearInstallMenuSelection`). If `handleTabSwap` logic can be extracted into a testable pure function (e.g., a screen toggle helper), add tests for it following the same pattern.
- If the logic is too simple to extract (just a ternary screen toggle), this task may be skipped — the behavior is covered by the input-handler tests and manual testing.

**Constraints:**
- Follow the existing test file's pattern of testing exported helper functions, not rendering the full App component
- Don't over-test simple state toggles

**Acceptance criteria:**
- [ ] If a helper is extracted: tests verify it toggles between `'items'` and `'colors'` and returns the correct screen for each input
- [ ] All existing App tests still pass
- [ ] Commit

---

## Task 7: Manual testing and verification

**Goal:** Verify the complete Tab-swap flow works end-to-end in the TUI.

**Files:** None (testing only)

**What to verify:**
- Start TUI with `bun run start`
- Navigate: Main Menu → Edit Lines → select a line → ItemsEditor
- Select a colorable widget, press Tab — verify ColorMenu opens with the same widget highlighted
- Press Tab again — verify ItemsEditor opens with the same widget highlighted
- Navigate to a separator in ItemsEditor — verify Tab hint is grayed out, Tab does nothing
- Press Escape in ColorMenu — verify it goes to the color LineSelector (not back to ItemsEditor)
- Press Escape in ItemsEditor — verify it goes to the items LineSelector
- Navigate: Main Menu → Edit Colors → select a line → ColorMenu — verify normal entry still works
- Run `bun run lint` — verify no type errors or lint issues
- Run `bun test` — verify all tests pass

**Acceptance criteria:**
- [ ] Tab-swap preserves position in both directions
- [ ] Tab is disabled (grayed hint) on non-colorable widgets
- [ ] Escape behavior is independent of how the editor was entered
- [ ] Both main menu entry paths still work normally
- [ ] Lint and tests pass
- [ ] Final commit if any fixes needed
