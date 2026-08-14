# Theme-Aware Per-Widget Color Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user override an individual widget's foreground and/or background colour while a Powerline theme is active, without changing the appearance of any existing config on upgrade.

**Architecture:** Add two per-channel boolean "pin" flags to `WidgetItem`. A pinned channel's own colour wins over the theme in the Powerline render path; unpinned channels take the theme exactly as today. Because existing configs have no pins, their persisted colours stay dormant under a theme — so opening them renders identically and no settings migration is required. Editing a colour while a theme is active pins that channel (non-destructively surfacing the widget's existing colour); "unpin" hands a channel back to the theme without wiping the colour.

**Tech Stack:** TypeScript, Zod (`WidgetItemSchema`), React/Ink TUI, Vitest.

**Scope note:** This plan covers the **colour model** — data model, render precedence, the no-visual-change guarantee, the pin/unpin editing flow, and the theme-switch keep/remove prompt (sirmalloc's points 1, 4, 5). The **navigation/visual restyle** — making colour editing keep the widget-editor's "shape" as a `Color Editing mode`, turning the old top-level colour menu into a signpost, and the exact ESC target (points 2 and 3) — is a **separate follow-up plan**. This plan removes the managed-theme Tab guard so colour editing is *reachable* under a theme, but does not restyle the editor.

---

## Naming decisions (used verbatim across all tasks)

- Schema fields (both `z.boolean().optional()` on `WidgetItemSchema`):
  - `pinColor` — when `true`, the widget's `color` (foreground) overrides the active theme.
  - `pinBackgroundColor` — when `true`, the widget's `backgroundColor` overrides the active theme.
- Mutation helpers (in `src/tui/components/color-menu/mutations.ts`):
  - `pinWidgetColor(widgets: WidgetItem[], widgetId: string, isBackground: boolean, seedColor: string): WidgetItem[]`
  - `unpinWidgetColor(widgets: WidgetItem[], widgetId: string, isBackground: boolean): WidgetItem[]`
  - `clearAllPins(widgets: WidgetItem[]): WidgetItem[]`

## Project-wide constraints (every task must honor)

- **No migration.** Both new fields are `.optional()`. Existing settings files load unchanged. Do not add any migration or settings rewrite.
- **`preserveColors` is untouched.** It stays custom-command/foreground-only with its current meaning ("the command paints its own foreground; apply no fg from us"). It is a *different* concept from a pin and must keep its exact current behaviour. In the fg precedence it sits **above** the pin.
- **Theme colour cycling must not shift.** In the Powerline render path, the per-widget theme colour index advances for every non-merged widget when a theme is active. A pinned widget still advances the index (it occupies its slot; it just doesn't use the colour), so pinning one widget must not change the theme colours assigned to any other widget.
- **Pins are a no-op without an active theme.** Themes exist only in the Powerline render path and only when `theme` is set and `!== 'custom'`. In the standard (non-powerline) path and in powerline-without-theme, `widget.color`/`widget.backgroundColor` already apply directly; pins change nothing there.
- Run checks with `bun run lint` and tests with `bun test`. Never disable a lint rule via comment.

---

## Task 1 — Add `pinColor` / `pinBackgroundColor` to the widget schema

**Goal:** Introduce the two per-channel pin flags so later tasks (renderer, editor, prompt) have a place to read and write, *because* everything else depends on these fields existing and being optional (which is what preserves the no-migration guarantee).

**Files:** `src/types/Widget.ts`

**Interfaces (produced for later tasks):**
```ts
// added to WidgetItemSchema (z.object)
pinColor: z.boolean().optional(),
pinBackgroundColor: z.boolean().optional(),
```
`WidgetItem` (the inferred type) therefore gains `pinColor?: boolean` and `pinBackgroundColor?: boolean`.

**Tests:** `src/types/__tests__/widget-schema.test.ts` (create if absent; otherwise add to the existing schema test file).
```ts
it('accepts pinColor and pinBackgroundColor', () => {
    const parsed = WidgetItemSchema.parse({
        id: 'w1', type: 'model', color: 'red',
        pinColor: true, pinBackgroundColor: false
    });
    expect(parsed.pinColor).toBe(true);
    expect(parsed.pinBackgroundColor).toBe(false);
});

it('loads a config without pin fields (existing settings, no migration)', () => {
    const parsed = WidgetItemSchema.parse({ id: 'w1', type: 'model', color: 'red' });
    expect(parsed.pinColor).toBeUndefined();
    expect(parsed.pinBackgroundColor).toBeUndefined();
});
```

**Constraints:** Fields MUST be `.optional()`. Do not reorder or alter existing fields.

**Acceptance criteria:** New tests pass; `bun run lint` clean; existing schema tests unaffected.

**Risks:** Minimal. Only risk is a typo in field names diverging from the naming block above — copy them verbatim.

---

## Task 2 — Honor pins in the Powerline render path (the guarantee)

**Goal:** Make a pinned channel's widget colour win over the theme, while leaving every unpinned channel — and every existing config — rendering exactly as before. This task *is* the hard requirement; its regression tests are the proof.

**Files:** `src/utils/renderer.ts` (the theme-application block inside `renderPowerlineStatusLine` where `themeColors` is applied to `fgColor`/`bgColor`).

**Decision to implement (contract, not code):** when a theme is active for a widget:
- Foreground precedence: (1) custom-command + `preserveColors` → keep the widget's own fg *(existing)*; (2) else if `pinColor` → keep `widget.color` (do **not** apply theme fg); (3) else → apply theme fg.
- Background precedence: (1) if `pinBackgroundColor` → keep `widget.backgroundColor` (do **not** apply theme bg); (2) else → apply theme bg.
- The theme colour index still advances for the widget regardless of pins (see project-wide "cycling must not shift" constraint).

**Tests:** `src/utils/__tests__/renderer-theme-color-override.test.ts` (new). Model the setup on `renderer-powerline-theme.test.ts` — build `DEFAULT_SETTINGS` with `colorLevel: 3`, `powerline.enabled: true`, `powerline.theme: 'nord-aurora'`; render via `preRenderAllWidgets` → `calculateMaxWidthsFromPreRendered` → `renderStatusLine`; assert with `getColorAnsiCode(spec, 'truecolor', isBackground)`.

```ts
// THE no-change guarantee: a legacy colour persisted under a theme stays dormant.
it('ignores an unpinned widget colour under a theme (no change on upgrade)', () => {
    const widgets = [{ id: 'w1', type: 'custom-text', customText: 'x', color: 'red' }];
    const line = renderThemed(widgets); // helper mirroring renderer-powerline-theme.test.ts
    expect(line).not.toContain(getColorAnsiCode('red', 'truecolor', false));
});

// A pinned foreground overrides the theme.
it('applies a pinned widget foreground over the theme', () => {
    const widgets = [{ id: 'w1', type: 'custom-text', customText: 'x', color: 'red', pinColor: true }];
    const line = renderThemed(widgets);
    expect(line).toContain(getColorAnsiCode('red', 'truecolor', false));
});

// fg and bg pins are independent.
it('pins background independently of foreground', () => {
    const widgets = [{ id: 'w1', type: 'custom-text', customText: 'x',
        color: 'red', backgroundColor: 'blue', pinBackgroundColor: true }]; // pinColor absent
    const line = renderThemed(widgets);
    expect(line).toContain(getColorAnsiCode('blue', 'truecolor', true));   // bg overridden
    expect(line).not.toContain(getColorAnsiCode('red', 'truecolor', false)); // fg still themed
});

// Cycling must not shift: pinning w1 must not change w2's theme colour.
it('keeps other widgets\' theme colours stable when one widget is pinned', () => {
    const base = [
        { id: 'w1', type: 'custom-text', customText: 'a' },
        { id: 'w2', type: 'custom-text', customText: 'b' }
    ];
    const pinned = [
        { id: 'w1', type: 'custom-text', customText: 'a', color: 'red', pinColor: true },
        { id: 'w2', type: 'custom-text', customText: 'b' }
    ];
    // w2's applied theme foreground is identical in both renders.
    const w2ThemeFgBase = extractWidgetFg(renderThemed(base), 'b');
    const w2ThemeFgPinned = extractWidgetFg(renderThemed(pinned), 'b');
    expect(w2ThemeFgPinned).toBe(w2ThemeFgBase);
});

// preserveColors regression guard: unchanged behaviour under a theme.
it('leaves custom-command preserveColors behaviour unchanged', () => {
    const widgets = [{ id: 'w1', type: 'custom-command', commandPath: 'echo', preserveColors: true, color: 'red' }];
    const line = renderThemed(widgets);
    // fg not themed (preserveColors), bg still themed — same as before this feature.
    expect(line).not.toContain(/* theme fg[0] ansi code */);
});
```

**Constraints:** Do not change the index-increment logic. Do not touch the standard (`renderStatusLine` non-powerline) colour path. The `not.toContain('red')` assertion in the first test is the load-bearing guarantee and must not depend on knowing the theme's exact hex.

**Acceptance criteria:** All new tests pass; **every existing test in `renderer-powerline-theme.test.ts` and `powerline-theme-index.test.ts` still passes** (proves no shift/regression); `bun run lint` clean.

**Risks:** The `extractWidgetFg` helper and the exact theme-hex assertions must match the existing harness's ANSI representation — confirm against `renderer-powerline-theme.test.ts` before finalizing assertion form. If exposing a per-widget theme colour for `extractWidgetFg` is awkward, assert stability by comparing the full rendered substrings for w2 instead.

---

## Task 3 — Pin / unpin mutation helpers

**Goal:** Provide pure, unit-testable functions the editor uses to pin (non-destructively surfacing a colour) and unpin (without wiping the colour), *so that* the editing behaviour is testable without driving the Ink UI.

**Files:** `src/tui/components/color-menu/mutations.ts`

**Interfaces (produced for Task 5 & 6):**
```ts
export function pinWidgetColor(widgets: WidgetItem[], widgetId: string, isBackground: boolean, seedColor: string): WidgetItem[];
export function unpinWidgetColor(widgets: WidgetItem[], widgetId: string, isBackground: boolean): WidgetItem[];
export function clearAllPins(widgets: WidgetItem[]): WidgetItem[];
```
Semantics (the decisions):
- `pinWidgetColor`: sets `pinColor` (fg) or `pinBackgroundColor` (bg) to `true`. If that channel's colour value (`color`/`backgroundColor`) is **unset**, set it to `seedColor`. If it is already set, **leave it** (surface the existing choice).
- `unpinWidgetColor`: sets the channel's pin flag to `false`/removes it. Leaves the colour value untouched.
- `clearAllPins`: removes `pinColor` and `pinBackgroundColor` from every widget. Leaves colour values untouched.
- All three return a new array (follow `updateWidgetById` immutability pattern already in this file).

**Tests:** `src/tui/components/color-menu/__tests__/pin-mutations.test.ts` (new).
```ts
it('pin surfaces an existing colour without overwriting it', () => {
    const w = [{ id: 'w1', type: 'model', color: 'red' }];
    const out = pinWidgetColor(w, 'w1', false, 'cyan');
    expect(out[0].pinColor).toBe(true);
    expect(out[0].color).toBe('red'); // seed ignored because a colour already exists
});

it('pin seeds the colour when none is set', () => {
    const w = [{ id: 'w1', type: 'model' }];
    const out = pinWidgetColor(w, 'w1', false, 'cyan');
    expect(out[0].pinColor).toBe(true);
    expect(out[0].color).toBe('cyan');
});

it('pin targets background independently', () => {
    const w = [{ id: 'w1', type: 'model', color: 'red' }];
    const out = pinWidgetColor(w, 'w1', true, 'blue');
    expect(out[0].pinBackgroundColor).toBe(true);
    expect(out[0].backgroundColor).toBe('blue');
    expect(out[0].pinColor).toBeUndefined(); // fg untouched
});

it('unpin clears the flag but keeps the colour', () => {
    const w = [{ id: 'w1', type: 'model', color: 'blue', pinColor: true }];
    const out = unpinWidgetColor(w, 'w1', false);
    expect(out[0].pinColor).toBeFalsy();
    expect(out[0].color).toBe('blue'); // NOT an undo — colour stays
});

it('clearAllPins removes pins from all widgets, keeps colours', () => {
    const w = [
        { id: 'w1', type: 'model', color: 'red', pinColor: true },
        { id: 'w2', type: 'git-branch', backgroundColor: 'blue', pinBackgroundColor: true }
    ];
    const out = clearAllPins(w);
    expect(out[0].pinColor).toBeFalsy();
    expect(out[1].pinBackgroundColor).toBeFalsy();
    expect(out[0].color).toBe('red');
    expect(out[1].backgroundColor).toBe('blue');
});
```

**Constraints:** Pure functions, no mutation of inputs. `unpinWidgetColor` must never alter the colour value — that is the "reset only removes the pin" decision.

**Acceptance criteria:** Tests pass; `bun run lint` clean.

**Risks:** Low.

---

## Task 4 — Make `(r)eset` clear pins; keep it distinct from unpin

**Goal:** Ensure the existing "reset styling" action fully forgets a widget's styling *including* its pins, so a reset widget can't be left pinned-with-no-colour and render a default over the theme. Unpin (Task 3) stays a separate, colour-preserving action — *because* the two actions mean different things ("forget my colour" vs "let the theme have it back").

**Files:** `src/tui/components/color-menu/mutations.ts` (`resetWidgetStyling`)

**Interfaces (consumed):** `resetWidgetStyling(widgets: WidgetItem[], widgetId: string): WidgetItem[]` (existing signature — unchanged).

**Tests:** add to the existing `mutations` test file (or `pin-mutations.test.ts`).
```ts
it('resetWidgetStyling clears pins as well as colours', () => {
    const w = [{ id: 'w1', type: 'model', color: 'red', backgroundColor: 'blue',
        pinColor: true, pinBackgroundColor: true, bold: true }];
    const out = resetWidgetStyling(w, 'w1');
    expect(out[0].pinColor).toBeUndefined();
    expect(out[0].pinBackgroundColor).toBeUndefined();
    expect(out[0].color).toBeUndefined();
    expect(out[0].backgroundColor).toBeUndefined();
});
```

**Constraints:** Do not change what `resetWidgetStyling` already clears; only additionally clear the two pin flags. Do not fold unpin into reset — they remain separate actions.

**Acceptance criteria:** New test passes; existing `resetWidgetStyling`/`clearAllWidgetStyling` tests still pass; `bun run lint` clean.

**Risks:** Low. Confirm `clearAllWidgetStyling` also clears pins if it is meant to fully wipe styling (add an equivalent assertion if that helper exists and is used by "(c)lear all").

---

## Task 5 — Reachable + wired colour editing under a theme (pin/unpin in ColorMenu)

**Goal:** Let the user actually pin/unpin from the colour editor while a theme is active: remove the guard that currently disables the Tab route under a managed theme, make setting a colour under a theme pin that channel, and add an explicit pin-toggle plus help text. *Because* without this the render capability from Task 2 has no way to be exercised by a user.

**Files:** `src/tui/App.tsx` (remove the managed-theme guard on `onTabSwap`), `src/tui/components/ColorMenu.tsx` (wire pin on colour edit, add pin-toggle keybind + help text).

**Decisions (contract):**
- **Remove the guard:** at both `ItemsEditor` and `ColorMenu` render sites, pass `onTabSwap={handleTabSwap}` unconditionally (drop the `isThemeManaged ? undefined :`). The `isThemeManaged` computation may remain if used elsewhere; the Tab route must no longer be suppressed by it.
- **Theme detection in the editor:** a theme is active when `settings.powerline.enabled && settings.powerline.theme && settings.powerline.theme !== 'custom'` (same predicate as the renderer and the old guard).
- **Editing a colour under a theme pins that channel:** whenever the editor commits a colour to a channel (the `editingBackground` flag selects fg vs bg) and a theme is active, the corresponding pin flag is set (so the colour actually takes effect). Use `pinWidgetColor` / `setWidgetColor` from mutations. When no theme is active, behaviour is unchanged.
- **Pin-toggle keybind `(p)`:** toggles the pin on the highlighted widget's current channel (fg, or bg when `editingBackground`). Pinning uses `pinWidgetColor` with `seedColor = getWidget(widget.type).getDefaultColor()` when the channel colour is unset. Unpinning uses `unpinWidgetColor`. **Constraint:** `p` must not collide with existing ColorMenu keys (`h`, `a`, `g`, `r`, `c`, background toggle, tab, digits) — verify before wiring; pick another letter if it clashes.
- **Help text:** under a theme, surface the pin/unpin affordance; keep `(r)eset` labelled distinctly from unpin ("(r)eset" = forget styling; pin-toggle = theme override on/off).

**Tests:** logic-level via the Task 3 helpers is already covered. Add a focused ColorMenu interaction test under `src/tui/components/**/__tests__/` in the style of the existing editor tests (e.g. `symbol-override-editor.test.tsx`) asserting that, with a theme active, committing a colour to a widget results in an `onUpdate` payload where that widget has both the colour and the matching pin set; and that pressing the pin-toggle key on a pinned widget clears the pin (via the resulting `onUpdate` payload). If driving Ink proves heavy, assert instead that the ColorMenu's commit handler produces the expected widget array through the extracted mutation helpers.

**Constraints:** Do not restyle the editor or change its screens (that's the follow-up plan). Only: unguard the route, pin-on-edit, add the toggle + help text. ESC behaviour is left as-is for this plan.

**Acceptance criteria:** Under a theme, a user can Tab into colour editing, set a colour, see it take effect (manual check via `bun run start` with a themed config), and unpin to return the channel to the theme. `bun run lint` clean; `bun test` green.

**Risks:** Keybind collision (mitigated by the verify-before-wiring constraint). The editor's "current colour" display should read the effective colour so a freshly pinned widget shows its surfaced colour — confirm the preview reflects the pinned value.

---

## Task 6 — Keep/remove overrides prompt on theme change

**Goal:** When the active theme changes and any widget is pinned, prompt the user to keep or remove their overrides (sirmalloc's point 5), *so that* switching themes doesn't silently carry or silently drop custom colours.

**Files:** the Powerline theme selector component (locate via the theme-selection screen; likely `src/tui/components/PowerlineSetup.tsx` or the theme selector it renders) + reuse `clearAllPins` from Task 3.

**Decisions (contract):**
- Trigger: when the user changes the active theme (switch theme, or enable/disable) **and** at least one widget on the affected line(s) has `pinColor` or `pinBackgroundColor` set.
- Prompt options: **Keep** — leave pins as they are (pinned colours carry over and win against the new theme too). **Remove** — call `clearAllPins` on the affected widgets (unpin all; colour values are left dormant, consistent with the non-destructive unpin decision — "remove" means the overrides stop applying, not that the colours are deleted).
- If no widget is pinned, change the theme with no prompt (no behaviour change from today).

**Tests:** `src/tui/components/__tests__/theme-switch-pins.test.ts` (new) at the logic level: given a widget list with pins and a "remove" choice, the resulting widget list has all pins cleared and all colour values intact (assert against `clearAllPins`); given "keep", the list is unchanged. Drive the confirm-dialog wiring with an interaction test only if the existing theme-selector already has one to model on.

**Constraints:** "Remove" is `clearAllPins` only — do not delete colour values. Reuse the existing confirm-dialog mechanism (`ConfirmDialogState` / the pattern used by "(c)lear all") rather than inventing a new prompt style.

**Acceptance criteria:** Switching themes with pins present prompts; "Remove" unpins all (colours preserved, dormant); "Keep" carries pins to the new theme; no prompt when nothing is pinned. `bun run lint` clean; `bun test` green.

**Risks:** Locating the exact theme-change entry point — front-load a short search for where `powerline.theme` is written on selection. If theme changes can happen from more than one screen, ensure the prompt covers the user-facing path(s); note any path deliberately left unguarded.

---

## Self-review notes

- **Spec coverage:** point 1 (edit under theme) → Tasks 1/2/5; point 4 (renderer overrides per channel) → Task 2; point 5 (keep/remove prompt) → Task 6; hard requirement (no visual change + regression tests) → Task 2 (guarantee tests) + Task 1 (no migration). Points 2 and 3 (signpost, Color-Editing-mode restyle, ESC target) are explicitly deferred to a follow-up plan.
- **Guarantee anchor:** the single most important assertion is Task 2's "ignores an unpinned widget colour under a theme" — it encodes the no-change-on-upgrade requirement and is theme-hex-independent.
- **Interface consistency:** `pinColor` / `pinBackgroundColor` and the three mutation helpers are named identically everywhere above; `isBackground` is the channel selector throughout.
