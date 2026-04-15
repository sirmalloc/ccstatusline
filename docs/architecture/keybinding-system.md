# Keybinding System Architecture

## Current State: Well-Architected but Undocumented

### How It Works Today

**Widget-Specific Keybindings:**
```typescript
interface CustomKeybind {
    key: string;      // Single character
    label: string;    // Help text like "(u)sed/remaining"
    action: string;   // Internal action identifier
}

// Each widget optionally implements:
getCustomKeybinds?(item?: WidgetItem): CustomKeybind[]
```

**ItemsEditor Global Keybindings:**
Hardcoded in `handleNormalInputMode()` function with clear precedence:
- `a`, `i`, `d`, `c` - Widget management
- `r`, `m` - Property toggles
- Space - Separator cycling
- Arrow keys, Enter, Escape - Navigation

**Execution Flow (from `handleNormalInputMode`):**
1. Global keybinds checked first (lines 363-436)
2. Widget-specific keybinds checked last (lines 437-463)
3. Widget keybinds only apply to **currently selected widget**

**Key Insight:** Multiple widgets CAN safely use the same keybind (e.g., `u` used by ContextPercentage and Link) because only one widget is selected at a time. No conflicts occur.

**Actual Problems:**

1. **No Documentation**
   - No guide for choosing keybinds when creating widgets
   - No mnemonic conventions documented
   - Current assignments discovered only by grep
   - Risk: Adding new **global** keybind that shadows popular widget keybinds

2. **No Validation**
   - No automated check that new global keybind doesn't shadow widget keybinds
   - No list of "popular" widget keybinds to avoid

## Risk Assessment (Corrected)

### Current Impact: Low
- Architecture is sound (precedence rules work well)
- Widget keybinds don't conflict with each other
- Works reliably for current widgets

### Future Risk: Low-Medium
- Main risk: Adding new global keybind that shadows popular widget keybinds
- Example: Making `h` global would break many git widgets
- Mitigation: Document popular widget keybinds, validate before adding globals

## Proposed Solutions

### Option 1: Documentation Only (Minimum Viable Fix)

**Deliverables:**
1. `docs/keybindings-reference.md` ✅ (created)
2. `docs/architecture/keybinding-conventions.md` (new)
   - Mnemonic guidelines
   - Conflict resolution rules
   - Reserved keys list
3. Update `CONTRIBUTING.md` with keybind selection guide

**Pros:**
- Low effort
- Immediate improvement
- No code changes

**Cons:**
- Still relies on manual checking
- Doesn't prevent mistakes
- Doesn't detect existing conflicts

### Option 2: Static Validation (Recommended)

**Add automated validation:**

```typescript
// src/utils/keybind-validator.ts

// Global reserved keys
const GLOBAL_KEYBINDS = ['a', 'i', 'd', 'c', 'r', 'm', ' '];

// Validate all widget keybinds don't conflict
export function validateKeybinds(): ValidationResult {
    const allWidgets = getAllWidgetTypes();
    const conflicts: Conflict[] = [];

    for (const type of allWidgets) {
        const widget = getWidget(type);
        const keybinds = widget.getCustomKeybinds?.() ?? [];

        for (const kb of keybinds) {
            // Check global conflicts
            if (GLOBAL_KEYBINDS.includes(kb.key)) {
                conflicts.push({
                    key: kb.key,
                    widget: type,
                    conflictsWith: 'global',
                    severity: 'error'
                });
            }

            // Check cross-widget conflicts
            // (requires registry of all keybinds)
        }
    }

    return { valid: conflicts.length === 0, conflicts };
}
```

**Integration Points:**
- Run in test suite (fail CI if conflicts detected)
- Run at startup in dev mode (warn in console)
- Optional: Display in TUI settings menu

**Pros:**
- Catches conflicts automatically
- Prevents regressions
- Self-documenting (code is truth)

**Cons:**
- Requires development effort
- Doesn't solve "which key should I choose?" problem
- Widget-specific keybinds can still conflict if widgets are on same line

### Option 3: Dynamic Keybind Registry (Full Solution)

**Runtime-aware keybinding:**

```typescript
// ItemsEditor computes available keys based on current widget
const availableKeys = computeAvailableKeys(
    currentWidget,
    widgets,
    selectedIndex
);

// Display shows only non-conflicting keybinds
const displayKeybinds = customKeybinds.filter(kb =>
    availableKeys.includes(kb.key)
);

// Conflicts shown with warning
const conflicts = customKeybinds.filter(kb =>
    !availableKeys.includes(kb.key)
);
```

**Pros:**
- Perfect conflict resolution
- User sees only working keybinds
- Can suggest alternatives if conflict

**Cons:**
- Significant complexity
- Runtime overhead
- May confuse users (keybinds change per widget)

## Recommendation

**Immediate (Phase 1-2):**
- ✅ Create `keybindings-reference.md` (done)
- ⬜ Add static validation test
- ⬜ Document mnemonic conventions

**Medium-term (Phase 9):**
- Add conflict warnings in TUI
- Reserve namespace for common actions (e.g., all `h` = hide)

**Long-term:**
- Consider namespaced keybinds (Ctrl/Meta combos for advanced features)
- Consider modal keybindings (vi-style: different modes, different keys)

## Mnemonic Conventions (Proposed)

### Tier 1: Obvious Mnemonics (Preferred)
- `e` = Edit (text, command, URL)
- `l` = Link (to external resource)
- `h` = Hide (conditional visibility)
- `d` = Delete (global)
- `a` = Add (global)
- `t` = Timeout, Timer
- `s` = Segments, Short (context-dependent)
- `w` = Width, Window (context-dependent)

### Tier 2: Phonetic/Conceptual
- `v` = View mode, inVert
- `p` = Progress, Preserve
- `f` = Format, Fish-style
- `n` = Nerd font
- `r` = Raw value (global)
- `m` = Merge (global)

### Tier 3: Available (No Established Pattern)
- `b`, `g`, `j`, `k`, `q`, `x`, `y`, `z`

### Reserved for Global (Never Use in Widgets)
- `a`, `i`, `d`, `c` - Widget management
- `r`, `m` - Property toggles
- Arrow keys, Enter, Escape, Space - Navigation

## Decision for Rules Editor

**Context:** Need keybind to open RulesEditor from ItemsEditor

**Analysis:**
- `u` is taken (ContextPercentage, Link widgets) - but that's okay for widget keybinds
- Need new **global** keybind that doesn't shadow popular widget keybinds
- Want conceptual link to "rules", "conditions", "exceptions"
- Should be easy to remember and type

**Decision: `x` - e(x)ceptions** ✅

**Rationale:**
- **Mnemonic:** e(x)ceptions - rules are exceptions to base widget properties
- **Mental Model:** Matches how users think ("make an exception when percentage > 75")
- **Availability:** Not used as global keybind, not used by any widget
- **Clarity:** Clear purpose - editing conditional property overrides
- **Naturalness:** Natural English word, no phonetic tricks

**Help text:** `(x) exceptions`

**Reserved:** `x` is now reserved for rules-related features (no widgets should use `x`)

## Action Items

- [ ] Add test: `src/utils/__tests__/keybind-validator.test.ts`
- [ ] Create: `docs/architecture/keybinding-conventions.md`
- [ ] Update: `CONTRIBUTING.md` with widget keybind selection guide
- [ ] Reserve `x` for rules-related features
- [ ] Document in Phase 2 plan
