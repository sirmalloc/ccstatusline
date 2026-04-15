# Widget Typed Values Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each widget a declared value type (`'string' | 'number' | 'boolean'`) so the rules engine evaluates conditions using the widget's own typed value extraction, eliminating fragile render-and-parse guessing.

**Architecture:** The Widget interface gains a `getValueType()` method declaring what kind of value the widget produces, and a `getValue()` method that returns the typed result. The rules engine calls `getValue()` instead of the current `getWidgetValue()` which guesses types via heuristic parsing. Each widget that implements `getValue()` derives its value from its own `render(rawValue: true)` output, ensuring preview mode works automatically (since `render()` already handles `isPreview`). Widgets that don't implement these methods (separators, custom symbols, compound-value widgets) have no evaluable value and fall back to string extraction from their rendered output.

**Tech Stack:** TypeScript, Vitest, React/Ink (TUI)

---

## File Structure

### Modified files

| File | Responsibility |
|---|---|
| `src/types/Widget.ts` | Add `getValueType()` and `getValue()` to Widget interface; remove `getNumericValue()` |
| `src/utils/widget-values.ts` | Rewrite to dispatch on `getValueType()` instead of guessing; remove `parseNumericValue`, `supportsNumericValue`, and `DEBUG_RULES` logging; verify all import sites of removed exports |
| `src/utils/rules-engine.ts` | Update `evaluateCondition()` to use new typed value extraction |
| `src/widgets/GitConflicts.ts` | Implement `getValueType`/`getValue`; remove `getNumericValue` |
| `src/widgets/GitStaged.ts` | Implement `getValueType`/`getValue` as boolean; remove `getNumericValue` |
| `src/widgets/GitUnstaged.ts` | Same as GitStaged |
| `src/widgets/GitUntracked.ts` | Same as GitStaged |
| `src/widgets/GitAheadBehind.ts` | Remove `getNumericValue` (no replacement — compound value, no single typed interpretation) |
| `src/widgets/GitChanges.ts` | Implement `getValueType`/`getValue` as boolean (replaces special-case in widget-values.ts) |
| `src/widgets/ContextPercentage.ts` | Implement `getValueType`/`getValue` as number |
| `src/widgets/ContextPercentageUsable.ts` | Same |
| `src/widgets/TokensInput.ts` | Implement `getValueType`/`getValue` as number |
| `src/widgets/TokensOutput.ts` | Same |
| `src/widgets/TokensCached.ts` | Same |
| `src/widgets/TokensTotal.ts` | Same |
| `src/widgets/ContextLength.ts` | Same |
| `src/widgets/SessionCost.ts` | Implement `getValueType`/`getValue` as number (strip currency symbol) |
| `src/widgets/TerminalWidth.ts` | Implement `getValueType`/`getValue` as number |
| `src/widgets/InputSpeed.ts` | Implement `getValueType`/`getValue` as number (strip ` t/s` suffix) |
| `src/widgets/OutputSpeed.ts` | Same |
| `src/widgets/TotalSpeed.ts` | Same |
| `src/widgets/GitIsFork.ts` | Implement `getValueType`/`getValue` as boolean |
| `src/widgets/GitWorktreeMode.ts` | Implement `getValueType`/`getValue` as boolean |
| `src/widgets/SessionUsage.ts` | Implement `getValueType`/`getValue` as number (extract percentage from context data directly) |
| `src/widgets/WeeklyUsage.ts` | Same |

### Modified test files

| File | Responsibility |
|---|---|
| `src/utils/__tests__/widget-values.test.ts` | Rewrite to test typed value extraction via `getValue()` |
| `src/utils/__tests__/rules-engine.test.ts` | Update tests that rely on type-guessing behaviour |
| `src/types/__tests__/Widget.test.ts` | Add tests for `getValueType`/`getValue` interface contract |

### New files

| File | Responsibility |
|---|---|
| `src/utils/value-parsers.ts` | Shared parse helpers: `parsePercentage`, `parseCurrency`, `parseTokenCount`, `parseSpeed`, `parseBooleanString`, `parseIntSafe` |

### Widgets intentionally NOT given typed values

These widgets are intentionally excluded from `getValueType`/`getValue` because their values are either compound, non-evaluable, or only meaningful as strings (which the fallback path handles):

| Widget | Reason |
|---|---|
| `GitAheadBehind` | Compound pair (`'2,3'`) — no single numeric interpretation. Works via string fallback. |
| `GitInsertions` | Does not support `rawValue` (`supportsRawValue(): false`). Renders `+42` in display mode. Works via string fallback if used in rules. |
| `GitDeletions` | Same as GitInsertions — `supportsRawValue(): false`, renders `-10`. |
| `GitStatus` | Compound indicator (`'+*'`) — not a single typed value. Works via string fallback. |
| `GitSha` | String (commit hash) — works via string fallback without needing typed value. |
| `GitBranch` | String (branch name) — works via string fallback. |
| `GitRootDir` | String (directory name) — works via string fallback. |
| `GitOriginOwner/Repo/OwnerRepo` | String — works via string fallback. |
| `GitUpstreamOwner/Repo/OwnerRepo` | String — works via string fallback. |
| `GitWorktreeBranch/Name/OriginalBranch` | String — works via string fallback. |
| `Model`, `Version`, `OutputStyle` | String — works via string fallback. |
| `ClaudeSessionId`, `ClaudeAccountEmail` | String — works via string fallback. |
| `SessionName`, `ThinkingEffort`, `VimMode` | String — works via string fallback. |
| `CurrentWorkingDir` | String — works via string fallback. |
| `CustomText`, `CustomSymbol`, `CustomCommand` | User-defined content — no intrinsic type. Works via string fallback. |
| `Link`, `GitPr`, `Skills` | Complex display widgets — no single evaluable value. |
| `FreeMemory` | Compound (`'12.4G/16.0G'`) — no single numeric value. Works via string fallback. |
| `BlockTimer`, `BlockResetTimer`, `SessionClock`, `WeeklyResetTimer` | Duration strings (`'3hr 45m'`). Converting to seconds is possible but there's no obvious user rule against time ("when session > 7200 seconds" is not intuitive). Can be added later if needed. |
| `ContextBar` | Progress bar with embedded percentage — compound display. Can be added later if needed. |
| Separators (`separator`, `flex-separator`) | Not content widgets — no evaluable value. |

### Files with no other changes needed

- `src/tui/components/ConditionEditor.tsx` — currently presents all operator categories regardless of widget type. Filtering operators by widget value type is a UX improvement but out of scope for this refactor. The rules engine handles type mismatches gracefully (returns false), so showing all operators is safe, just less guided.
- `src/utils/widget-properties.ts` — no changes needed
- `src/tui/components/rules-editor/` — no changes needed

---

## Design decisions

### getValue() and render() — the settings parameter

Each widget's `getValue()` calls `this.render({ ...item, rawValue: true }, context, DEFAULT_SETTINGS)`. This uses default settings rather than the user's actual settings. This is acceptable because:

- The `rawValue: true` flag bypasses most formatting that depends on settings (labels, prefixes)
- The raw output is the widget's canonical data representation, not a display string
- Passing user settings would require threading settings through the rules engine and value extraction, adding significant complexity for no practical benefit
- Verified: SessionCost's currency symbol comes from `item.character`, not from settings. Speed widget suffixes are hardcoded. No widget's raw value output depends on settings in a way that changes the numeric result.

### SessionUsage/WeeklyUsage — direct data access

These widgets have multiple display modes including progress bars. In progress bar mode, the raw rendered output contains bar characters before the percentage (e.g., `'[███░░░░░] 20.0%'`), which is not cleanly parseable by `parsePercentage`. Rather than making the parser more complex, these widgets should extract the percentage value directly from `context.usageData` in their `getValue()` implementation, bypassing `render()`. This is the one exception to the "derive from render" pattern, and it's justified because the data is readily available on the context and the rendered format is display-oriented.

### GitChanges — boolean type

GitChanges currently has a special case in `getWidgetBooleanValue()` that converts its numeric value to boolean. The plan moves this logic into the widget itself by having it implement `getValueType(): 'boolean'` and `getValue()` returning whether there are any changes. This replaces the special case with the standard typed-value pattern. GitChanges does not support `rawValue` (`supportsRawValue(): false`), so its `getValue()` will need to call `render()` without `rawValue: true` and check whether the result is non-null and non-empty, or access git data directly. The implementer should check how the widget determines "has changes" in its `render()` method and use the same logic in `getValue()`.

---

## Tasks

### Phase 1: Shared parse helpers and Widget interface

#### Task 1.1: Create value-parsers.ts with shared parse helpers

**Goal:** Provide reusable, well-tested parse functions that widgets call in their `getValue()` implementations. These exist so widgets don't each re-implement parsing of percentages, currency, token counts, etc.

**Files:** Create `src/utils/value-parsers.ts` and `src/utils/__tests__/value-parsers.test.ts`

**Constraints:**
- Each function takes a string (the widget's raw rendered output) and returns a number, boolean, or null
- Functions should be pure — no widget or context dependencies
- `parsePercentage` strips trailing `%` and returns the number (e.g., `'9.3%'` → `9.3`)
- `parseCurrency` strips leading non-digit characters (any currency symbol) and parses the rest (e.g., `'$2.45'` → `2.45`, `'€10.00'` → `10.0`)
- `parseTokenCount` handles K/M/B suffixes, case-insensitive (e.g., `'15.2k'` → `15200`, `'1.5M'` → `1500000`, `'42'` → `42`)
- `parseSpeed` strips trailing ` t/s` suffix and parses the number (e.g., `'85.2 t/s'` → `85.2`)
- `parseBooleanString` parses `'true'`/`'false'` (case-insensitive) to boolean, returns null for anything else
- `parseIntSafe` parses an integer string, returns null for non-integer or floating-point input

**Acceptance criteria:**
- [ ] Write tests for each parse helper covering normal, edge, and null cases
- [ ] Run tests, confirm they fail (no implementation yet)
- [ ] Implement the parse helpers
- [ ] Run tests, confirm they pass
- [ ] Commit

#### Task 1.2: Add getValueType and getValue to Widget interface

**Goal:** Extend the Widget interface so each widget can declare its value type and provide typed value extraction, replacing the current `getNumericValue` method.

**Files:** Modify `src/types/Widget.ts`

**Constraints:**
- `getValueType()` returns `'string' | 'number' | 'boolean'` or is not implemented (meaning no evaluable value — falls back to string extraction from rendered output)
- `getValue(context, item)` returns `number | string | boolean | null`
- Both are optional on the interface (same pattern as existing `getNumericValue`)
- Remove `getNumericValue` from the interface — it is replaced by `getValue`
- Important: the return type of `getValue()` must align with what `getValueType()` declares — a number widget returns a number from `getValue()`, not a string. This is a convention, not enforced by TypeScript (since the return type is a union). Document this clearly on the interface.

**Acceptance criteria:**
- [ ] Update the Widget interface: add `getValueType?()` and `getValue?()`, remove `getNumericValue?()`
- [ ] Update `src/types/__tests__/Widget.test.ts` to cover the new interface methods (schema validation for rules that reference typed values)
- [ ] Confirm the project has type errors only in `src/utils/widget-values.ts` and any callers of `getNumericValue` (not in widget files themselves, since `getNumericValue` is optional). The widget files that implement `getNumericValue` will have dead code, not type errors.
- [ ] Commit

### Phase 2: Implement getValue on widgets

Each sub-task follows the same pattern: the widget implements `getValueType()` and `getValue()`. For most widgets, `getValue()` calls `this.render({ ...item, rawValue: true }, context, DEFAULT_SETTINGS)` and applies the appropriate parse helper. Exceptions are noted in individual tasks.

**Constraint for all widget tasks:** Each widget's `getValue()` must handle `null` returns from `render()` — for number/string widgets this means returning `null` (no data). For boolean widgets, `null` from render means `false` (the condition is not present), except when the widget is not in a git repo at all (return `null`).

#### Task 2.1: Implement getValue on number widgets (context/tokens)

**Goal:** Add typed value extraction to the widgets that represent token counts and context percentages — the most common targets for numeric rules.

**Files:** Modify `ContextPercentage.ts`, `ContextPercentageUsable.ts`, `ContextLength.ts`, `TokensInput.ts`, `TokensOutput.ts`, `TokensCached.ts`, `TokensTotal.ts` (all in `src/widgets/`)

**Constraints:**
- All declare `getValueType(): 'number'`
- `getValue()` calls `this.render({ ...item, rawValue: true }, context, DEFAULT_SETTINGS)` then applies the appropriate parser
- Context percentage widgets use `parsePercentage`
- Token widgets and ContextLength use `parseTokenCount`
- None of these currently implement `getNumericValue`, so there is nothing to remove

**Acceptance criteria:**
- [ ] Write tests for each widget's `getValue()` — cover live data, preview mode, and missing data returning null
- [ ] Run tests, confirm they fail
- [ ] Implement `getValueType()` and `getValue()` on all 7 widgets
- [ ] Run tests, confirm they pass
- [ ] Commit

#### Task 2.2: Implement getValue on number widgets (cost, speed, terminal width)

**Goal:** Add typed value extraction to SessionCost, the three speed widgets, and TerminalWidth.

**Files:** Modify `SessionCost.ts`, `InputSpeed.ts`, `OutputSpeed.ts`, `TotalSpeed.ts`, `TerminalWidth.ts` (all in `src/widgets/`)

**Constraints:**
- SessionCost uses `parseCurrency` — the raw value starts with a currency symbol character from `item.character` (defaults to `$`), so the parser strips any leading non-digit character
- Speed widgets use `parseSpeed` — raw value format is `'85.2 t/s'`
- TerminalWidth uses `parseIntSafe` — raw value is a plain integer string
- All declare `getValueType(): 'number'`

**Acceptance criteria:**
- [ ] Write tests for each widget's `getValue()` — cover live data, preview mode, and missing data
- [ ] Run tests, confirm they fail
- [ ] Implement `getValueType()` and `getValue()` on all 5 widgets
- [ ] Run tests, confirm they pass
- [ ] Commit

#### Task 2.3: Implement getValue on usage percentage widgets

**Goal:** Add typed value extraction to SessionUsage and WeeklyUsage.

**Files:** Modify `SessionUsage.ts`, `WeeklyUsage.ts` (in `src/widgets/`)

**Constraints:**
- These widgets have multiple display modes including progress bars. In progress bar mode, the raw rendered output includes bar characters before the percentage, making it unparseable by `parsePercentage`.
- `getValue()` for these widgets should extract the percentage directly from `context.usageData` rather than parsing rendered output. This is the one exception to the "derive from render" pattern — see Design Decisions section.
- The widget already has access to the percentage calculation logic in its `render()` method. `getValue()` should replicate that percentage extraction from context data, not call render.
- Must still handle preview mode: when `context.isPreview`, return the hardcoded preview percentage value that matches what `render()` displays.

**Acceptance criteria:**
- [ ] Write tests covering percentage extraction from context data, preview mode, and missing data
- [ ] Run tests, confirm they fail
- [ ] Implement `getValueType()` and `getValue()`
- [ ] Run tests, confirm they pass
- [ ] Commit

#### Task 2.4: Implement getValue on boolean widgets

**Goal:** Convert GitStaged, GitUnstaged, GitUntracked, GitIsFork, GitWorktreeMode, and GitChanges to proper boolean value extraction.

**Files:** Modify `GitStaged.ts`, `GitUnstaged.ts`, `GitUntracked.ts`, `GitIsFork.ts`, `GitWorktreeMode.ts`, `GitChanges.ts` (all in `src/widgets/`)

**Constraints:**
- All declare `getValueType(): 'boolean'`
- Remove `getNumericValue()` from GitStaged, GitUnstaged, GitUntracked (the three that currently implement it)
- GitIsFork and GitWorktreeMode render `'true'`/`'false'` as strings — `getValue()` calls `this.render(rawItem, context, DEFAULT_SETTINGS)` then applies `parseBooleanString`
- GitStaged/GitUnstaged/GitUntracked `render()` returns `null` when the condition is false (widget hidden). `getValue()` must treat `null` render output as `false`, not as "no value". But if the widget is not in a git repo (`!isInsideGitWorkTree`), return `null` (truly no data).
- GitChanges does not support `rawValue` (`supportsRawValue(): false`). Its `getValue()` should determine "has changes" using the same git data its `render()` uses (e.g., checking whether insertions + deletions > 0 from the git diff stats), not by calling render and checking for non-null. This replaces the `git-changes` special case currently in `getWidgetBooleanValue()` in widget-values.ts.

**Acceptance criteria:**
- [ ] Write tests for each widget's `getValue()` — cover true case, false case, preview mode, and not-in-git-repo returning null
- [ ] Run tests, confirm they fail
- [ ] Implement `getValueType()` and `getValue()`, remove `getNumericValue()` from the three that have it
- [ ] Run tests, confirm they pass
- [ ] Commit

#### Task 2.5: Implement getValue on GitConflicts (number)

**Goal:** Convert GitConflicts from the old `getNumericValue()` to the new `getValue()` pattern.

**Files:** Modify `src/widgets/GitConflicts.ts`

**Constraints:**
- Declares `getValueType(): 'number'`
- `getValue()` calls `this.render({ ...item, rawValue: true }, context, DEFAULT_SETTINGS)` then applies `parseIntSafe`
- Remove `getNumericValue()`
- The raw value is a plain integer string (`'0'`, `'2'`, etc.) — straightforward parse

**Acceptance criteria:**
- [ ] Write tests for `getValue()` — cover zero conflicts, nonzero conflicts, preview mode, not-in-git-repo
- [ ] Run tests, confirm they fail
- [ ] Implement `getValueType()` and `getValue()`, remove `getNumericValue()`
- [ ] Run tests, confirm they pass
- [ ] Commit

#### Task 2.6: Remove getNumericValue from GitAheadBehind

**Goal:** Remove `getNumericValue()` from GitAheadBehind without replacing it. This widget's raw value is a comma-separated pair (`'2,3'`) which has no single meaningful numeric interpretation.

**Files:** Modify `src/widgets/GitAheadBehind.ts`

**Constraints:**
- Remove `getNumericValue()` — it currently returns `ahead + behind` which is semantically wrong
- Do NOT add `getValueType()` or `getValue()` — this widget's value is a compound pair, not a single typed value. It will work with string operators (`equals '0,0'`, `contains ','`) via the string fallback in widget-values.ts
- Risk: Existing user configs with numeric rules against git-ahead-behind will silently stop matching. This is acceptable because the previous behaviour was incorrect. Document in commit message.

**Acceptance criteria:**
- [ ] Remove `getNumericValue()`
- [ ] Verify no compile errors
- [ ] Verify existing tests still pass (update any that tested the sum behaviour)
- [ ] Commit

### Phase 3: Rewrite widget-values.ts

#### Task 3.1: Rewrite widget-values.ts to use typed dispatch

**Goal:** Replace the current guess-based value extraction with dispatch on the widget's declared value type. This is the core of the refactor — after this, the rules engine gets typed values instead of guessed ones.

**Files:** Modify `src/utils/widget-values.ts` and `src/utils/__tests__/widget-values.test.ts`

**Constraints:**
- `getWidgetValue()` becomes: check if widget implements `getValue()`. If yes, call `getValue()` and return the result. If no, fall back to rendering in raw mode (if the widget supports it) and returning the string. This fallback handles widgets like GitBranch, Model, etc. that don't declare a type but still have useful string values for rules.
- Remove `parseNumericValue()` entirely — widgets handle their own parsing now
- Remove `supportsNumericValue()` entirely — the signal is whether `widget.getValue` exists
- Remove the `DEBUG_RULES` logging block
- Remove the `git-changes` special case from `getWidgetBooleanValue()` — GitChanges now implements `getValue()` directly
- Search all import sites of `parseNumericValue`, `supportsNumericValue`, `getWidgetNumericValue`, `getWidgetStringValue`, `getWidgetBooleanValue` across the codebase and update or remove them. These may be imported in test files, rules-engine.ts, or TUI components.
- Assess whether `getWidgetNumericValue()`, `getWidgetStringValue()`, `getWidgetBooleanValue()` are still needed as separate functions. If the rules engine only uses `getWidgetValue()`, the type-specific functions can be removed. If they have other callers, simplify them to delegate to `getValue()` with a type check.

**Acceptance criteria:**
- [ ] Rewrite `getWidgetValue()` to use typed dispatch with string fallback
- [ ] Remove `parseNumericValue`, `supportsNumericValue`, `DEBUG_RULES` block
- [ ] Search for and update all import sites of removed/changed exports
- [ ] Rewrite `widget-values.test.ts` — remove tests for parse heuristics, add tests for typed dispatch and string fallback
- [ ] Run tests, confirm they pass
- [ ] Commit

#### Task 3.2: Update rules-engine.ts to use new value extraction

**Goal:** Ensure `evaluateCondition()` correctly uses the widget's declared type for operator routing.

**Files:** Modify `src/utils/rules-engine.ts` and `src/utils/__tests__/rules-engine.test.ts`

**Constraints:**
- The current code calls `getWidgetValue()` which returns `number | string | boolean | null`, then routes by operator type. This mostly still works — the returned type is now authoritative (from `getValue()`) rather than guessed.
- The `equals` operator routing (which currently checks `typeof widgetValue`) should still work since `getValue()` returns the correct type.
- Boolean evaluation: the current `evaluateBooleanCondition()` does type coercion from numbers and strings. This should remain for cases where a user applies `isTrue` to a number widget (non-zero = true is useful).
- Verify that cross-widget conditions still work (widget A's rule references widget B's value).
- Update any calls to removed functions from widget-values.ts.

**Acceptance criteria:**
- [ ] Update any value extraction calls that changed signature
- [ ] Run the full rules-engine test suite, fix any failures from the refactor
- [ ] Add test cases for: boolean widget with `isTrue`/`isFalse`, number widget with numeric operators, string widget with string operators, cross-widget condition with typed values
- [ ] Confirm all tests pass
- [ ] Commit

### Phase 4: Cleanup and verification

#### Task 4.1: Fix preview mock data comment

**Goal:** Correct the misleading comments in `createPreviewContextData()`.

**Files:** Modify `src/tui/components/StatusLinePreview.tsx`

**Constraints:**
- Line 29: `total_input_tokens: 18600` comment says "Results in ~9.3% used" — this is `18600/200000 = 9.3%` which is the total context percentage
- Line 32: `used_percentage: 11.6` comment says "Matches context-percentage-usable preview" — this is the usable percentage at 80% usable context (`18600/160000 = 11.6%`)
- Clarify both comments so it's obvious which metric each one corresponds to and which widget uses it

**Acceptance criteria:**
- [ ] Update comments to accurately describe what each value represents
- [ ] Commit

#### Task 4.2: Full test suite run and verification

**Goal:** Verify the entire refactor is clean — no regressions, no type errors, no lint issues.

**Files:** None (verification only)

**Acceptance criteria:**
- [ ] Run full test suite — all tests pass (except the pre-existing unrelated `usage-fetch.test.ts` proxy failure)
- [ ] Run lint — no errors from project files (the worktree lint errors from `.claude/worktrees/` are pre-existing and not ours)
- [ ] Verify that preview mode produces consistent values: for at least 3 widget types (one number, one boolean, one string), confirm that the value the rules engine evaluates in preview matches what the widget displays in preview
- [ ] Commit any final fixes
