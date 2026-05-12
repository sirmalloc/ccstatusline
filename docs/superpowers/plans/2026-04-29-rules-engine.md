# Widget Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conditional property overrides to widgets so that colors, visibility, and display properties change based on live context (e.g., turn context percentage red when > 80%).

**Architecture:** Rules are stored on each WidgetItem as an optional array. At render time, the rules engine evaluates each rule's condition against the current context using typed widget values, then merges matching rule overrides onto the widget before rendering. The TUI exposes rule editing through a shared accordion pattern in both ItemsEditor (structure) and ColorMenu (appearance), with accordion state preserved across Tab-swap.

**Tech Stack:** TypeScript, React/Ink, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-04-29-rules-engine-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/types/Condition.ts` | Condition types, operator enums, operator groupings by value type, helper functions for reading condition fields |
| `src/utils/value-parsers.ts` | Pure parser functions for converting raw widget output to typed values (tokens, percentage, currency, speed, int, boolean) |
| `src/utils/widget-values.ts` | `getWidgetValue` dispatch (tries getValue then render fallback), `getValueFromRender` shared helper |
| `src/utils/rules-engine.ts` | Condition evaluation (numeric, string, boolean, existence operators), rule matching, property merging |
| `src/tui/components/ConditionEditor.tsx` | Overlay component for editing a rule's when clause (widget picker, operator selector, value input, negation toggle) |
| `src/tui/hooks/useRuleAccordion.ts` | Shared hook for accordion state and navigation (expand/collapse, rule selection, badge rendering helpers) |
| `src/types/__tests__/Condition.test.ts` | Tests for condition types and helpers |
| `src/utils/__tests__/value-parsers.test.ts` | Tests for parser functions |
| `src/utils/__tests__/widget-values.test.ts` | Tests for getWidgetValue dispatch and fallback |
| `src/utils/__tests__/rules-engine.test.ts` | Tests for condition evaluation and rule matching |
| `src/utils/__tests__/renderer-rules.test.ts` | Tests for renderer integration with rules |

### Modified Files

| File | Change |
|------|--------|
| `src/types/Widget.ts` | Add `rules` to WidgetItemSchema; add `getValueType()` and `getValue()` to Widget interface; remove `getNumericValue()` |
| `src/utils/renderer.ts` | Evaluate rules in `preRenderAllWidgets()` before each widget render |
| `src/tui/App.tsx` | Lift accordion state (expandedWidgetId, selectedRuleIndex), pass to both editors |
| `src/tui/components/ItemsEditor.tsx` | Accordion rendering, rule-level input routing, help text |
| `src/tui/components/items-editor/input-handlers.ts` | Rule-level keybind handling (add, delete, reorder, condition edit, stop toggle) |
| `src/tui/components/ColorMenu.tsx` | Accordion rendering, rule-level color editing routing |
| `src/tui/components/color-menu/mutations.ts` | Extend mutations to target rule.apply when a rule index is provided |
| 8 git widget files | Migrate `getNumericValue()` to `getValue()` with `getValueType()` returning `'number'` |
| Token/context/cost/speed widget files | Add `getValueType()` returning `'number'` and `getValue()` using shared helper with appropriate parser |

---

## Phase 1: Data Layer

### Task 1: Condition Types

**Goal:** Define the type system for rule conditions so that the rules engine and condition editor have a shared vocabulary for operators, value types, and condition structure.

**Files:** Create `src/types/Condition.ts` and `src/types/__tests__/Condition.test.ts`

**What to build:**
- Operator enums grouped by value type: string operators (equals, contains, startsWith, endsWith), number operators (equals, greaterThan, greaterThanOrEqual, lessThan, lessThanOrEqual), boolean operators (equals), existence operators (isNull, isNotNull)
- Display labels for each operator (for the condition editor UI)
- A typed Condition interface with fields: widget (string), operator, value, optional not flag
- Helper functions for reading condition fields from the loosely-typed record: getConditionWidget, getConditionOperator, getConditionValue, getConditionNot
- Functions to classify operators by type: isNumericOperator, isStringOperator, isBooleanOperator, isExistenceOperator
- A function to get available operators for a given value type

**Constraints:**
- The old branch has `src/types/Condition.ts` that can be referenced for structure, but it uses "Set" operators (isEmpty/isNotEmpty) which should be renamed to "Existence" operators (isNull/isNotNull) per the spec
- Operators should be string literal types, not numeric enums, for JSON serialization compatibility

**Acceptance criteria:**
- [ ] All operator types defined with display labels
- [ ] Helper functions for reading condition fields from records
- [ ] Operator classification and filtering by value type
- [ ] Tests cover all helpers and classifications
- [ ] Commit

---

### Task 2: Add rules field to WidgetItem Schema

**Goal:** Add the `rules` field to the Zod schema early so that all subsequent tasks (value extraction, rules engine, renderer) can reference the typed rules structure on WidgetItem.

**Files:** Modify `src/types/Widget.ts`

**What to build:**
- Add `rules` as an optional array to `WidgetItemSchema`
- The `when` object should use a proper condition schema (widget, operator, value, not)
- The `apply` object should be restricted to appearance properties only: color, backgroundColor, bold, rawValue, customText, hide
- Each rule has an optional `stop` boolean

**Constraints:**
- The field must be `.optional()` so existing settings files load without migration
- Do NOT include structural properties (id, type, commandPath, timeout, metadata, merge, maxWidth, preserveColors, rules) in the apply schema
- The when schema can use `z.record(z.string(), z.any())` initially if a fully typed condition schema is complex — the Condition type helpers handle runtime validation

**Acceptance criteria:**
- [ ] rules field present on WidgetItemSchema as optional
- [ ] Settings files without rules load correctly
- [ ] Settings files with rules preserve them through load/save
- [ ] TypeScript compiles
- [ ] Commit

---

### Task 3: Value Parsers

**Goal:** Provide pure parser functions that convert raw widget render output into typed values, so that `getValue()` implementations across widgets can delegate to shared parsing logic instead of duplicating it.

**Files:** Create `src/utils/value-parsers.ts` and `src/utils/__tests__/value-parsers.test.ts`

**What to build:**
- `parseTokenCount(value: string): number | null` — handles "18.6k" → 18600, "1.5M" → 1500000, plain numbers
- `parsePercentage(value: string): number | null` — handles "42%" → 42
- `parseCurrency(value: string): number | null` — handles "$2.45" → 2.45, strips currency symbols
- `parseSpeed(value: string): number | null` — handles "85.2 t/s" → 85.2
- `parseIntSafe(value: string): number | null` — strict integer parsing, rejects floats
- `parseBooleanString(value: string): boolean | null` — handles "true"/"false" strings, case-insensitive

**Constraints:**
- The old branch has these implemented in `src/utils/value-parsers.ts` — use as reference
- All functions must be pure (no side effects, no dependencies)
- Return null for unparseable input, never throw

**Acceptance criteria:**
- [ ] All parser functions implemented
- [ ] Tests cover normal cases, edge cases (empty string, null, malformed input, boundary values)
- [ ] Commit

---

### Task 4: Widget Value Extraction

**Goal:** Provide the central value extraction mechanism that the rules engine will use to get typed values from widgets for condition evaluation.

**Files:** Create `src/utils/widget-values.ts` and `src/utils/__tests__/widget-values.test.ts`; modify `src/types/Widget.ts`

**What to build:**
- Add `getValueType?(): 'string' | 'number' | 'boolean'` and `getValue?(context: RenderContext, item: WidgetItem): number | string | boolean | null` to the Widget interface
- Remove `getNumericValue?()` from the Widget interface
- `getValueFromRender(widget, context, item, parser)` — shared helper: renders widget with rawValue true, applies parser to output. This is what individual widget getValue implementations will delegate to.
- `getWidgetValue(widgetType, context, item)` — dispatch function: calls widget.getValue() if implemented, otherwise falls back to rendering in raw mode and returning the string

**Constraints:**
- `getValueFromRender` must use `DEFAULT_SETTINGS` when calling render (same as old branch) because value extraction should not be affected by user display settings
- The render fallback must use rawValue mode if the widget supports it, otherwise render normally
- Removing `getNumericValue` from the interface is safe — grep confirms no callers, only implementations

**Acceptance criteria:**
- [ ] Widget interface updated (getValue, getValueType added; getNumericValue removed)
- [ ] getValueFromRender helper works with any parser function
- [ ] getWidgetValue dispatch: uses getValue when available, falls back to raw render string
- [ ] Tests cover dispatch logic, render fallback, null handling
- [ ] TypeScript compiles for new files (existing widget implementations of getNumericValue will show errors — that's expected and addressed in Task 5)
- [ ] Commit

---

### Task 5: Migrate getNumericValue to getValue on Existing Widgets

**Goal:** Update the 8 widgets that currently implement `getNumericValue()` to use the new `getValue()` / `getValueType()` interface, so that TypeScript compiles cleanly after the interface change.

**Files:** Modify 8 widget files: `GitStaged.ts`, `GitUnstaged.ts`, `GitUntracked.ts`, `GitConflicts.ts`, `GitAheadBehind.ts`, `GitStagedFiles.ts`, `GitUnstagedFiles.ts`, `GitUntrackedFiles.ts`

**What to build:**
- Replace `getNumericValue()` with `getValueType()` returning `'number'` and `getValue()` returning the same numeric value
- Each widget's getValue logic stays the same — just rename the method and add getValueType

**Constraints:**
- These widgets have custom value logic (they read from git context directly, not from rendered output) — they should NOT use getValueFromRender
- GitAheadBehind is special — the old branch removed getNumericValue from it because ahead/behind is a pair, not a single number. Check what it currently returns and decide whether to migrate or simply remove.

**Acceptance criteria:**
- [ ] All 8 widgets migrated from getNumericValue to getValue/getValueType
- [ ] TypeScript compiles without errors
- [ ] Existing tests still pass
- [ ] Commit

---

### Task 6: Add getValue to Token, Context, Cost, and Speed Widgets

**Goal:** Give numeric value support to the widgets most useful for rules (e.g., "when context > 80%, change color") using the shared getValueFromRender helper and parsers.

**Files:** Modify token widgets (TokensInput, TokensOutput, TokensCached, TokensTotal), context widgets (ContextLength, ContextPercentage, ContextPercentageUsable, ContextWindow, CompactionCounter), cost widget (SessionCost), speed widgets (InputSpeed, OutputSpeed, TotalSpeed), and usage widgets (SessionUsage, WeeklyUsage)

**What to build:**
- Each widget adds `getValueType()` returning `'number'` and `getValue()` delegating to `getValueFromRender(this, context, item, parseXxx)` with the appropriate parser
- Token widgets use `parseTokenCount`
- Context percentage widgets use `parsePercentage`
- ContextLength and ContextWindow use `parseTokenCount`
- Cost widget uses `parseCurrency`
- Speed widgets use `parseSpeed`
- SessionUsage and WeeklyUsage have custom logic — they read percentage values directly from `context.usageData`, not from rendered output

**Constraints:**
- Each getValue implementation should be a one-liner delegating to getValueFromRender, except SessionUsage/WeeklyUsage which have custom logic
- CompactionCounter uses parseIntSafe
- Import DEFAULT_SETTINGS is needed for getValueFromRender — check if it's already imported

**Acceptance criteria:**
- [ ] All target widgets implement getValueType and getValue
- [ ] Token widgets return parsed numeric values (not formatted strings)
- [ ] Percentage widgets return numeric percentages
- [ ] TypeScript compiles
- [ ] Commit

---

### Task 7: Rules Engine Core

**Goal:** Implement the condition evaluation and rule matching logic that the renderer will use to apply conditional property overrides.

**Files:** Create `src/utils/rules-engine.ts` and `src/utils/__tests__/rules-engine.test.ts`

**What to build:**
- Numeric condition evaluation (greaterThan, lessThan, etc.)
- String condition evaluation (equals, contains, startsWith, endsWith)
- Boolean condition evaluation (equals)
- Existence condition evaluation (isNull, isNotNull)
- Negation support (not flag inverts result)
- Single rule evaluation: given a rule's when clause and the current context, return whether it matches
- Multiple rule evaluation: given a widget's rules array, evaluate in order, return the merged apply overrides from all matching rules, stopping at the first rule with stop=true
- Property merging: merge rule.apply onto widget item, only overriding the properties that are present in apply

**Constraints:**
- The old branch has this in `src/utils/rules-engine.ts` — reference for structure, but update operator names (isEmpty/isNotEmpty → isNull/isNotNull)
- Rule evaluation must handle type mismatches gracefully — if a numeric operator receives a string value, the condition does not match (returns false)
- A rule with no conditions or an invalid condition does not match
- For cross-widget conditions (where `rule.when.widget` references a different widget type), the engine needs the full widget list for the current line to resolve the target widget. It finds the first widget of the matching type in the line. If no widget of that type exists, the condition evaluates to false.

**Acceptance criteria:**
- [ ] All operator types evaluate correctly
- [ ] Negation works for all operator types
- [ ] Multiple rule evaluation with stacking and stop flag
- [ ] Type mismatch handling (graceful false, no crashes)
- [ ] Comprehensive tests for each operator, edge cases, stacking, stop
- [ ] Commit

---

### Task 8: Renderer Integration

**Goal:** Wire the rules engine into the rendering pipeline so that widget rules are evaluated and applied before each widget renders.

**Files:** Modify `src/utils/renderer.ts`; create `src/utils/__tests__/renderer-rules.test.ts`

**What to build:**
- In `preRenderAllWidgets()`, before calling `widgetImpl.render()` for each widget, check if the widget has rules
- If it has rules, call the rules engine to evaluate them against the current context
- If any rules match, merge the apply overrides onto the widget item before rendering
- If apply includes `hide: true`, skip the widget (push nothing to preRenderedLine, or push with empty content similar to how unknown widgets are skipped)

**Constraints:**
- Rule evaluation happens AFTER the minimalist rawValue override (line 518 of renderer.ts) but the merged properties from rules should take precedence
- The rules engine needs access to the full widget list for the current line (for cross-widget conditions) and the render context. Pass `lineWidgets` to the evaluation function so it can resolve cross-widget references by finding the first widget of the referenced type.
- Separators are skipped (already handled by the existing separator check) — they should not have rules evaluated
- Note: `getWidgetValue` via string fallback may render the referenced widget on-demand. This means some widgets could be rendered twice (once for condition evaluation, once for display). This is acceptable for initial implementation — a render cache is a future optimization.

**Acceptance criteria:**
- [ ] Widgets with matching rules render with overridden properties
- [ ] Widgets with non-matching rules render normally
- [ ] hide override causes widget to be skipped
- [ ] Multiple rules stack correctly
- [ ] stop flag halts evaluation
- [ ] Tests cover: single rule override, multiple rules, stop, hide, no rules (baseline)
- [ ] Commit

---

## Phase 2: TUI — Shared Accordion

### Task 9: Accordion Hook

**Goal:** Create a shared hook that both ItemsEditor and ColorMenu use for accordion state management, so the expand/collapse interaction is identical in both editors.

**Files:** Create `src/tui/hooks/useRuleAccordion.ts`

**What to build:**
- State: `expandedWidgetId` (string | null), `selectedRuleIndex` (number)
- Actions: expand(widgetId), collapse(), selectRule(index), moveRuleUp, moveRuleDown
- Helper: `getRuleCount(widget)` — returns the number of rules on a widget (for badge display)
- Helper: `isExpanded(widgetId)` — checks if a widget's accordion is open
- The hook should accept the widgets array so it can validate indices and handle edge cases (e.g., collapse if expanded widget is deleted)

**Constraints:**
- This hook manages navigation state only — it does not modify widget data (adding/deleting rules is done by the editors)
- The accordion state will later be lifted to App.tsx for Tab-swap persistence (Task 14), but for now it lives in the hook

**Acceptance criteria:**
- [ ] Hook provides expand/collapse/select state and helpers
- [ ] Edge cases handled: expand non-existent widget, select out-of-bounds rule index
- [ ] Tests cover state transitions, edge cases, and helper functions
- [ ] TypeScript compiles
- [ ] Commit

---

### Task 10: App-Level Accordion State for Tab-Swap

**Goal:** Lift accordion state to App.tsx so that expanding a rule in one editor and Tabbing to the other preserves the expansion, consistent with how activeWidgetId preserves cursor position.

**Files:** Modify `src/tui/App.tsx`

**What to build:**
- New state: `expandedWidgetId` and `selectedRuleIndex` (same pattern as `activeWidgetId`)
- Pass these to both ItemsEditor and ColorMenu as props
- Callbacks for editors to update accordion state

**Constraints:**
- Follow the exact same pattern as the Tab-swap activeWidgetId implementation from the previous PR
- The accordion hook (Task 9) should accept these as initial values or controlled state

**Acceptance criteria:**
- [ ] Accordion state lifted to App
- [ ] Both editors receive accordion props
- [ ] TypeScript compiles
- [ ] Commit

---

## Phase 3: TUI — ItemsEditor Rules

### Task 11: Accordion Rendering in ItemsEditor

**Goal:** Show rules as indented sub-rows beneath a widget when it is expanded, with a rule count badge on widgets that have rules.

**Files:** Modify `src/tui/components/ItemsEditor.tsx`

**What to build:**
- Use the accordion hook to manage expand/collapse state
- When a widget has rules, show a badge like `[2 rules]` next to the widget name
- When expanded, show each rule as an indented sub-row beneath the widget, with condition text and applied properties summary
- The currently selected rule should be highlighted
- When no rules exist on an expanded widget, show a placeholder

**Constraints:**
- The widget list rendering already maps over `widgets` — rules sub-rows need to be interleaved after the parent widget row
- The selectedIndex for widget-level navigation should skip over rule sub-rows (rule navigation is handled by the accordion hook)

**Acceptance criteria:**
- [ ] Rule count badges shown on widgets with rules
- [ ] Expanded widgets show rule sub-rows
- [ ] Selected rule is highlighted
- [ ] Empty state placeholder when no rules
- [ ] Existing widget rendering unchanged
- [ ] Commit

---

### Task 12: Rule-Level Input Handlers in ItemsEditor

**Goal:** Add keybind handling for rule-level operations when a rule is selected within an expanded widget.

**Files:** Modify `src/tui/components/items-editor/input-handlers.ts` and `src/tui/components/ItemsEditor.tsx`

**What to build:**
- Use `x` to expand/collapse the accordion (not taken by any existing widget-level keybind in handleNormalInputMode — arrows, Enter, a, i, d, k, c, r, m, space, Tab, Escape are all used)
- When a rule is selected (accordion expanded), handle: add rule, delete rule, move rule up/down (reorder), toggle stop flag
- Rule-level keybinds should mirror widget-level conventions where possible (e.g., `a` to add, `d` to delete) since the context switch is clear from the help text
- Input routing: when accordion is expanded and a rule is selected, route input to rule-level handlers instead of widget-level handlers
- Update help text to be mode-aware: show rule-level keybinds when a rule is selected, widget-level keybinds otherwise

**Constraints:**
- Rule-level input handling should be a separate function (similar to handleNormalInputMode / handleMoveInputMode pattern) for clarity
- Adding a rule should create a new rule with an empty condition and no apply overrides
- Deleting the last rule should collapse the accordion
- Reordering should wrap around (consistent with existing wrap-around navigation)

**Acceptance criteria:**
- [ ] Expand/collapse keybind works
- [ ] Add, delete, reorder rules at rule level
- [ ] Stop flag toggle works
- [ ] Help text reflects current mode (widget vs rule level)
- [ ] No keybind conflicts with existing widget-level keybinds
- [ ] Tests for rule-level keybind handling
- [ ] Commit

---

### Task 13: ConditionEditor Component

**Goal:** Create an overlay component that lets users configure a rule's when clause — selecting which widget to evaluate, which operator to use, and what value to compare against.

**Files:** Create `src/tui/components/ConditionEditor.tsx`

**What to build:**
- Widget type picker (reuse the existing widget picker pattern from items-editor/input-handlers)
- Operator selector filtered by the selected widget's value type (uses getValueType from the widget registry)
- Value input field for the comparison value
- Negation toggle (not flag)
- Save and cancel actions

**Constraints:**
- The old branch has a ConditionEditor at ~620 lines — reference for structure but adapt to the current codebase patterns
- The component receives the current condition (for editing existing rules) and callbacks for save/cancel
- Operator filtering: if the target widget has no getValueType (defaults to string), show string + existence operators. If it returns 'number', show number + existence operators. If 'boolean', show boolean + existence operators.
- The widget picker should include ALL widget types in the catalog, not just widgets currently in the status line, because you might want to create a condition based on a widget type that isn't displayed

**Acceptance criteria:**
- [ ] Widget type picker works
- [ ] Operators filtered by value type
- [ ] Value input accepts appropriate input
- [ ] Negation toggle works
- [ ] Save produces a valid condition record
- [ ] Cancel returns without changes
- [ ] Commit

---

### Task 14: Wire ConditionEditor into ItemsEditor

**Goal:** Connect the ConditionEditor overlay to the rule-level editing flow so users can create and edit rule conditions.

**Files:** Modify `src/tui/components/ItemsEditor.tsx`

**What to build:**
- A keybind at rule level that opens the ConditionEditor overlay for the selected rule
- State to track whether the ConditionEditor is open and which rule it's editing
- On save, update the rule's when clause; on cancel, close the overlay
- For new rules (created via "add rule"), automatically open the ConditionEditor

**Constraints:**
- The ConditionEditor overlay should take over input handling while active (similar to how the widget picker overlay works in the existing code)
- The ConditionEditor receives the current rule's condition and the parent widget's type for context

**Acceptance criteria:**
- [ ] Keybind opens ConditionEditor for selected rule
- [ ] ConditionEditor save updates the rule's condition
- [ ] ConditionEditor cancel closes without changes
- [ ] New rules auto-open the ConditionEditor
- [ ] Commit

---

## Phase 4: TUI — ColorMenu Rules

### Task 15: Accordion Rendering in ColorMenu

**Goal:** Show the same accordion UI in ColorMenu so users can expand a widget to see and select individual rules for color editing.

**Files:** Modify `src/tui/components/ColorMenu.tsx`

**What to build:**
- Use the same accordion hook as ItemsEditor
- Rule count badges on widgets with rules
- Expanded widget shows rules as sub-rows with condition text
- Selected rule is highlighted
- Visual distinction: when a rule is selected, show the condition text in the color info area so the user knows which rule's colors they're editing

**Constraints:**
- ColorMenu uses SelectInput from ink-select-input for its widget list. When the accordion is expanded, switch to manual list rendering (the same pattern ColorMenu already uses during hex/ansi256 input modes — it renders a static list with manual cursor tracking). This avoids fighting SelectInput's built-in navigation when rule sub-rows are interleaved.
- The rule sub-rows in ColorMenu should show the rule's current color overrides (if any) alongside the condition text

**Acceptance criteria:**
- [ ] Rule count badges shown
- [ ] Accordion expand/collapse works
- [ ] Rule sub-rows displayed when expanded
- [ ] Visual indicator showing which rule's colors are being edited
- [ ] Existing ColorMenu behavior unchanged when no rules present
- [ ] Commit

---

### Task 16: Rule-Level Color Editing in ColorMenu

**Goal:** Enable color editing (cycle, hex, ansi256, bold, reset) targeting a rule's apply overrides instead of the widget's default colors.

**Files:** Modify `src/tui/components/ColorMenu.tsx` and `src/tui/components/color-menu/mutations.ts`

**What to build:**
- When a rule is selected in the accordion, color editing keybinds (←→ cycle, f toggle fg/bg, b bold, h hex, a ansi256, r reset) target `rule.apply.color`, `rule.apply.backgroundColor`, `rule.apply.bold` instead of the widget-level properties
- Extend mutation functions in mutations.ts to accept an optional rule index parameter. When provided, mutations read from and write to `widget.rules[ruleIndex].apply` instead of the widget directly
- The "current color" display should show the rule's override color, falling back to the widget's default if no override is set

**Constraints:**
- The mutations currently operate on a `WidgetItem[]` and find by widget ID. For rule-level, they need to additionally target a specific rule index within the widget's rules array
- Reset at rule level should remove the color override from rule.apply (not reset the widget's default color)
- Clear all at rule level should remove all color overrides from the selected rule's apply

**Acceptance criteria:**
- [ ] Color cycling targets rule.apply when a rule is selected
- [ ] Hex and ansi256 input targets rule.apply
- [ ] Bold toggle targets rule.apply
- [ ] Reset removes rule-level color override
- [ ] Current color display shows rule override or widget default
- [ ] Existing widget-level color editing unchanged
- [ ] Commit

---

## Phase 5: Integration & Verification

### Task 17: Manual Testing and Polish

**Goal:** Verify the complete rules flow end-to-end and fix any issues found.

**Files:** None (testing only), potentially any file for fixes

**What to verify:**
- Create a rule via ItemsEditor: expand widget, add rule, set condition (e.g., context-percentage > 80), set apply color to red
- Tab to ColorMenu: verify accordion is preserved, edit rule color there
- Tab back: verify changes persist
- Verify status line renders with the rule override when condition is met
- Verify status line renders normally when condition is not met
- Multiple rules on one widget: verify stacking and stop
- Delete a rule, verify it's removed
- Reorder rules, verify order change affects evaluation
- Escape from both editors: verify it goes to respective LineSelectorss
- Lint and full test suite pass

**Acceptance criteria:**
- [ ] End-to-end flow works: create rule, edit condition, edit colors, see result in status line
- [ ] Tab-swap preserves accordion state
- [ ] All keybinds work at both widget and rule levels
- [ ] Lint passes
- [ ] All tests pass
- [ ] Final commit for any fixes
