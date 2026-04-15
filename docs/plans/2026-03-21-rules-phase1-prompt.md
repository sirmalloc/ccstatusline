# Rules System - Phase 1 Implementation Prompt

## Context

ccstatusline currently has a color thresholds implementation that needs refactoring. We built the wrong abstraction - it combined condition editing with color selection in a single component (ColorRangesEditor), which doesn't align with the existing UI patterns.

## The Right Design: Rules System

### Core Concept
Widgets can have **rules** that conditionally override widget properties based on conditions. Think MS Office conditional formatting rules.

### Data Structure

```typescript
{
  "id": "abc-123",
  "type": "context-percentage",
  "color": "white",      // base/default properties
  "bold": false,
  "rules": [             // NEW: ordered array of rules
    {
      "when": {          // condition
        "greaterThan": 75
        // "widget": "git-dirty" for cross-widget (Phase 6)
      },
      "apply": {         // property overrides
        "color": "red",
        "bold": true
      },
      "stop": true       // stop processing remaining rules
    },
    {
      "when": { "greaterThan": 50 },
      "apply": { "color": "yellow" },
      "stop": true
    }
  ]
}
```

**Evaluation:**
1. Rules execute top-to-bottom in array order
2. First matching rule applies its overrides
3. If `stop: true`, don't process remaining rules
4. If no rules match, use base widget properties

### UI Pattern (Following Existing Conventions)

**Main Menu:**
- 📝 Edit Lines → manage widgets and their rules
- 🎨 Edit Colors → edit colors using ColorMenu

**Navigation Hierarchy:**
```
Edit Lines
└── ItemsEditor (widget list)
    └── Press 'u' on widget → RulesEditor
        └── Rules list (add/delete/reorder)
            └── Select rule → Edit rule properties
                ├── Color mode: ←→ cycle, (f) fg/bg, (b)old
                └── Property mode: widget-specific keybinds
```

**Key Principles:**
1. Rules are in "Edit Lines" path (widget configuration)
2. Color editing within rules uses existing ColorMenu patterns
3. Property editing within rules uses widget's existing keybinds
4. Maximum UI reuse - no new color pickers or property editors

### Display Pattern

**Widget list shows rules indicator:**
```
▶ 2. Context % (usable) [50/75 ^] (raw value) (2 rules)
                         ^^^^^^^^^^^           ^^^^^^^^^
                         threshold indicator   rules count
```

**Rules list shows visual + labels:**
```
Current rule applies: Cyan [BOLD] (hide when not fork)

▶ 1. Styled text (hide) (when >75) (stop)
  2. Styled text (when >50)
```
- Lines are rendered with their applied styles
- Properties shown as labels in parentheses

## What to Keep from Current Implementation

### Keep:
1. **Widget value extraction** (`src/utils/color-thresholds.ts`)
   - `getWidgetNumericValue()` function
   - Widget registry mapping types to values
   - Can be adapted for condition evaluation

2. **Renderer integration hooks**
   - The places where we check/apply overrides
   - Just need different data structure

### Discard:
1. **ColorRangesEditor.tsx** - wrong UI pattern
2. **ColorRange type** - too narrow
3. **color-threshold-presets.ts** - wrong structure
4. **parseColorRanges/resolveColorFromRanges** - wrong data model
5. **Current ItemsEditor integration** - routes to wrong component

## Phase 1: Schema + Display (Read-only)

**Goal:** Rules can exist in settings.json and display in UI (read-only)

### Tasks

#### Task 1: Add Rules to Schema
**File:** `src/types/Widget.ts`

Add to `WidgetItemSchema`:
```typescript
rules: z.array(z.object({
  when: z.record(z.any()),  // flexible for now
  apply: z.record(z.any()), // any widget properties
  stop: z.boolean().optional()
})).optional()
```

**Acceptance:**
- TypeScript compiles
- Can load settings.json with rules array
- Type inference works: `WidgetItem['rules']`

#### Task 2: Display Rules Indicator in ItemsEditor
**File:** `src/tui/components/ItemsEditor.tsx`

Modify widget display to show rule count:
```
2. Context % (usable) [green] (raw value) (2 rules)
                                          ^^^^^^^^^^
```

Show if `widget.rules && widget.rules.length > 0`:
- Format: `(${widget.rules.length} rule${widget.rules.length === 1 ? '' : 's'})`
- Add to the widget display line after other modifiers

**Acceptance:**
- Widgets without rules: no change
- Widgets with rules: shows count
- Manually test by adding rules to settings.json

#### Task 3: Test with Manual Data
**File:** `~/.config/ccstatusline/settings.json`

Manually add a rules array to a widget:
```json
{
  "id": "test-widget",
  "type": "context-percentage",
  "color": "white",
  "rules": [
    {
      "when": { "greaterThan": 75 },
      "apply": { "color": "red", "bold": true },
      "stop": true
    },
    {
      "when": { "greaterThan": 50 },
      "apply": { "color": "yellow" },
      "stop": true
    }
  ]
}
```

**Acceptance:**
- Settings load without error
- TUI shows "(2 rules)" indicator
- Verify with screenshot/manual testing

### Success Criteria for Phase 1

- [ ] Rules array exists in schema
- [ ] TypeScript compiles with no errors
- [ ] Settings.json with rules loads successfully
- [ ] Widget list shows rule count indicator
- [ ] No crashes or errors in TUI

### What NOT to Build in Phase 1

- ❌ No rule editing yet
- ❌ No condition evaluation yet
- ❌ Rules don't actually affect rendering yet
- ❌ No RulesEditor component yet

Just schema + display. Prove it can load and show.

## Future Phases (High-Level)

- **Phase 2:** RulesEditor component (view rules list)
- **Phase 3:** Add/delete rules
- **Phase 4:** Edit basic conditions (self, greaterThan only)
- **Phase 5:** Rules actually work (renderer evaluation)
- **Phase 6:** Cross-widget conditions
- **Phase 7:** Full property editing in rules
- **Phase 8:** Advanced operators (string, boolean, etc.)
- **Phase 9:** Cleanup old threshold implementation

## Files to Reference

- Current schema: `src/types/Widget.ts`
- Widget display: `src/tui/components/ItemsEditor.tsx`
- Settings type: `src/types/Settings.ts`
- Example widget with metadata: Check `git-is-fork` in settings.json

## Migration Notes

Settings with old `colorRanges` metadata will continue to work (ignored for now). We'll migrate in Phase 9 after new system is proven.
