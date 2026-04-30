# Widget Rules Engine

## Summary

Add conditional property overrides to widgets. A rule says "when widget X's value meets condition Y, apply property overrides Z." Rules are evaluated at render time, allowing widgets to change color, visibility, or display based on live context — e.g., turn context percentage red when it exceeds 80%.

The TUI exposes rule editing through an accordion pattern in both ItemsEditor and ColorMenu. Both editors let you expand a widget to see its rules. ItemsEditor handles rule structure (add, delete, reorder, conditions, non-color properties). ColorMenu handles rule appearance (color, backgroundColor, bold overrides). Tab-swap preserves accordion state across editors.

## Data Model

### Rules on WidgetItem

Add an optional `rules` array to `WidgetItemSchema`. The field is `.optional()` so existing settings files load without migration.

**`when` (Condition):** Typed schema with:
- `widget` (string) — the widget type whose value to evaluate
- `operator` (typed enum) — the comparison operator
- `value` (string | number | boolean) — the comparison value
- `not` (optional boolean) — negates the condition

If `when.widget` references a widget type that doesn't exist in the current status line, the condition evaluates to false (no match).

**`apply` (restricted subset of WidgetItem):** Only appearance and display properties are valid overrides: `color`, `backgroundColor`, `bold`, `rawValue`, `customText`, `hide`. Structural properties (`id`, `type`, `commandPath`, `timeout`, `metadata`, `merge`, `maxWidth`, `preserveColors`, `rules`) are not valid in `apply` and excluded from the schema. This is the same shape ColorMenu already edits.

If `apply` sets `hide: true`, the widget is skipped by the renderer and separator collapsing handles it the same as a null render.

**`stop` (optional boolean):** When true, stop evaluating subsequent rules after this one matches.

### Condition Operators

Operators are grouped by value type:

- **String:** equals, contains, startsWith, endsWith
- **Number:** equals, greaterThan, greaterThanOrEqual, lessThan, lessThanOrEqual
- **Boolean:** equals
- **Existence:** isNull, isNotNull (works on any type — checks whether the widget returns a value at all)

The condition editor filters available operators based on the target widget's declared value type.

## Value Extraction

### getWidgetValue — Central Entry Point

The rules engine evaluates conditions by calling `getWidgetValue(widgetType, context, item)`, which returns `number | string | boolean | null`.

Strategy:
1. If the widget implements `getValue()`, call it and return the typed result
2. Otherwise, fall back to rendering in raw mode and returning the string

This means every widget gets string rule support for free. Widgets that want numeric or boolean operators implement `getValueType()` and `getValue()`.

### Widget Interface Changes

Two optional methods added to the `Widget` interface, replacing the existing `getNumericValue()`:

- `getValueType()` — returns `'string' | 'number' | 'boolean'` or undefined. Declares the value type for operator filtering in the condition editor.
- `getValue(context, item)` — returns `number | string | boolean | null`. Extracts the typed value.

The existing `getNumericValue()` method on the Widget interface is removed. Widgets that currently implement `getNumericValue()` (GitStaged, GitUnstaged, GitUntracked, GitConflicts, GitAheadBehind, GitStagedFiles, GitUnstagedFiles, GitUntrackedFiles) migrate to `getValue()` returning the same numeric value, with `getValueType()` returning `'number'`.

### Who Implements What

- **Most widgets:** Nothing. They get string rules via render fallback.
- **Widgets returning numeric values** (tokens, context, cost, speed, git file counts): Implement both methods. `getValue` delegates to shared `getValueFromRender(widget, context, item, parser)` helper — a one-liner per widget.
- **Widgets returning boolean values** (if any — widgets indicating presence/absence states): Implement both methods with custom `getValue` logic. This category may be empty initially; it exists for widgets that are added or migrated in future.
- **Widgets with existing `getNumericValue()`:** Migrate to `getValue()` returning the same value.
- **SessionUsage/WeeklyUsage:** Implement both methods with custom `getValue` reading directly from usage data.

### Shared Infrastructure

- `getValueFromRender(widget, context, item, parser)` — shared helper that renders the widget in raw mode and applies a parser function. Eliminates the render-then-parse boilerplate.
- `value-parsers.ts` — pure parser functions: `parseTokenCount` (handles "18.6k" → 18600), `parsePercentage` ("42%" → 42), `parseCurrency` ("$2.45" → 2.45), `parseSpeed` ("85.2 t/s" → 85.2), `parseIntSafe`, `parseBooleanString`.

### Design Rationale

No base class changes or widget class declaration changes. Existing widgets and in-flight contributor PRs are unaffected. The interface methods are optional — widgets opt in to richer rule support when it adds value. The render fallback provides universal string-level rules without touching any widget code.

## Accordion UI

### Shared Pattern

Both ItemsEditor and ColorMenu gain the same accordion interaction for navigating into a widget's rules.

**Shared state** (lifted to App, same pattern as Tab-swap):
- `expandedWidgetId: string | null` — which widget has its rules panel open
- `selectedRuleIndex: number` — which rule is selected within the expanded widget

**Accordion behavior — identical in both editors:**
- A keybind expands the selected widget's rules (shows rules as indented sub-rows)
- Up/down navigates between rules within the expanded widget
- Collapsing returns focus to the widget level
- Widget list shows a rule count badge on widgets that have rules

**Tab-swap preserves accordion state** — expanding a rule in ItemsEditor and Tabbing to ColorMenu keeps the same widget expanded and same rule selected.

**Implementation:** Accordion navigation logic (expand, collapse, rule selection, badge rendering) is a shared hook or utility used by both editors.

### What Differs Per Editor

**ItemsEditor at rule level:** Add/delete/reorder rules, edit conditions (opens ConditionEditor overlay), toggle stop flag, edit non-color properties on `rule.apply`.

**ColorMenu at rule level:** Edit color, backgroundColor, bold on `rule.apply` — using the same keybinds and flows that exist for widget-level color editing, just targeting the rule's apply overrides instead.

## ItemsEditor Rule Editing

### Rule-Level Keybinds

Active when a rule is selected within an expanded widget:
- Add rule — creates a new rule with empty condition and no overrides
- Delete rule — removes the selected rule
- Reorder rules — move up/down (order matters — evaluated top to bottom)
- Edit condition — opens ConditionEditor overlay
- Toggle stop — toggles the stop flag
- Edit non-color properties — rawValue, customText, etc. on `rule.apply`

### ConditionEditor

Overlay component for configuring a rule's `when` clause:
- Select widget type to evaluate (picker from widget catalog)
- Select operator (filtered by target widget's value type)
- Enter comparison value
- Optional not/negation toggle

### Help Text

Mode-aware — shows different keybind hints when at widget level vs rule level.

## ColorMenu Rule Editing

### Widget Level (Collapsed)

Same as today — edit widget's default color, backgroundColor, bold. No change to existing behavior.

### Rule Level (Expanded, Rule Selected)

Same color editing keybinds apply — cycle color with ←→, toggle fg/bg with (f), (b)old, (h)ex, (a)nsi256, (r)eset. Instead of writing to `widget.color`, they write to `rule.apply.color` (and backgroundColor, bold).

### Mutation Targeting

The existing mutations in `color-menu/mutations.ts` work on widget properties. For rules, the caller targets `rule.apply` instead of the widget directly. The mutation functions need a small extension to accept an optional rule index, or the caller constructs the update path before calling them.

### Visual Distinction

When editing a rule's color, the display shows the condition text alongside the color preview so the user knows which rule they're editing.

## Renderer Integration

### Rule Evaluation at Render Time

In `src/utils/renderer.ts`, within the `preRenderAllWidgets()` function, before each `widgetImpl.render(item, context, settings)` call:

1. For each widget item with rules, iterate through `item.rules` in order
2. For each rule, evaluate `rule.when` against the current context
3. If the condition matches, merge `rule.apply` onto the widget item
4. If `rule.stop` is true, stop evaluating further rules
5. Pass the (potentially modified) widget item to `widgetImpl.render()`

### Rule Stacking

Multiple matching rules stack — a later rule can override an earlier rule's apply. The `stop` flag gives users control over evaluation order.

### Performance

Rules evaluation is lightweight — comparing values, not re-rendering widgets. `getWidgetValue` may call `widget.render()` for the string fallback case, which means a widget could be rendered twice (once for condition evaluation, once for display). This is acceptable for the initial implementation. A future optimization could cache pre-rendered values to avoid redundant render calls.

**Evaluation order:** Rules for all widgets are evaluated during the `preRenderAllWidgets` pass. If Widget A's rule checks Widget B's value via string fallback, Widget B is rendered on-demand by `getWidgetValue` regardless of whether it has been rendered yet in the pass. This is stateless — `render()` reads from the context, not from shared mutable state — so order does not matter.

## Testing Strategy

### Unit Tests

- Rules engine: condition evaluation for each operator type, negation, stop behavior, multiple matching rules
- Value parsers: all parser functions with edge cases
- Widget getValue: verify implemented widgets return correct typed values
- getWidgetValue: typed dispatch, string fallback, null handling
- Renderer integration: widget with rules renders with overrides, rule ordering, stop flag
- Condition types: operator filtering by value type

### Input Handler Tests

- Accordion expand/collapse keybinds
- Rule-level add/delete/reorder
- Tab-swap preserves accordion state

### Manual Testing

- Add rules via TUI, verify status line renders with conditional overrides
- Edit rule colors in ColorMenu, verify they apply
- Tab between editors with rules expanded
- Multiple rules on one widget, verify stacking and stop
- Widget with no rules — existing behavior unchanged

## PR Structure

Single PR with commits organised in logical groups:

1. Data layer — Condition types, value parsers, getWidgetValue helper, rules engine core, renderer integration, tests
2. Widget getValue — implementations on ~20 widgets using shared helper, tests
3. Shared accordion — hook/utility for accordion state and navigation
4. ItemsEditor rules TUI — rule-level state, input handlers, accordion rendering, condition editor, help text
5. ColorMenu rules TUI — rule-level color editing via accordion, mutation targeting
6. Accordion state in Tab-swap — lift expandedWidgetId/selectedRuleIndex to App, preserve across Tab

Branch off `feat/tab-swap-editors`.

## Files

### New Files

| File | Responsibility |
|------|---------------|
| `src/types/Condition.ts` | Condition types, operator enums, operator labels, helper functions |
| `src/utils/rules-engine.ts` | Condition evaluation, rule matching, widget property merging |
| `src/utils/value-parsers.ts` | Pure parser functions (tokens, percentage, currency, speed, int, boolean) |
| `src/utils/widget-values.ts` | `getWidgetValue` dispatch, `getValueFromRender` shared helper |
| `src/tui/components/ConditionEditor.tsx` | Overlay for editing rule conditions |
| `src/tui/hooks/useRuleAccordion.ts` (or similar) | Shared accordion state and navigation logic |

### Modified Files

| File | Change |
|------|--------|
| `src/types/Widget.ts` | Add optional `getValueType()` and `getValue()` to Widget interface; remove `getNumericValue()`; add `rules` to WidgetItemSchema |
| `src/utils/renderer.ts` | Evaluate rules before rendering each widget |
| `src/tui/App.tsx` | Lift accordion state, pass to both editors |
| `src/tui/components/ItemsEditor.tsx` | Rule-level state, input routing, accordion rendering, help text |
| `src/tui/components/items-editor/input-handlers.ts` | Rule-level keybind handling |
| `src/tui/components/ColorMenu.tsx` | Accordion rendering, rule-level color editing |
| `src/tui/components/color-menu/mutations.ts` | Extend to support rule-level targeting |
| Widget files with numeric/boolean values | Add `getValueType()` and `getValue()` implementations; migrate existing `getNumericValue()` to `getValue()` |
