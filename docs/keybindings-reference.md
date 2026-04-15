# ItemsEditor Keybindings Reference

## Global Keybindings (always available)

| Key | Action |
|-----|--------|
| ↑ / ↓ | Navigate up/down through widgets |
| ← / → | Open widget picker to change widget type |
| Enter | Enter move mode (reorder widgets) |
| Escape | Go back to previous menu |
| `a` | Add widget (append to end) |
| `i` | Insert widget (before current) |
| `d` | Delete current widget |
| `c` | Color ranges editor (if widget supports) OR clear all widgets |
| Space | Cycle separator character (separator widgets only) |
| `r` | Toggle raw value mode |
| `m` | Toggle merge mode (cycles: off → merged → merged-no-pad) |

## Widget-Specific Custom Keybindings

### Already in Use

| Key | Widgets | Action |
|-----|---------|--------|
| `e` | CustomText, CustomCommand, Link | Edit text/command |
| `f` | VimMode | Cycle format |
| `h` | CurrentWorkingDir, GitIsFork, Git widgets, Skills, WeeklyResetTimer, git-remote widgets | Hide (various conditions) or abbreviate home |
| `l` | GitBranch, GitRootDir, git-remote widgets, Skills | Link to GitHub/IDE/repo or edit limit |
| `n` | VimMode | Toggle nerd font |
| `o` | GitOriginOwnerRepo | Owner only when fork |
| `p` | CustomCommand, usage/timer widgets, ContextBar | Preserve colors or toggle progress |
| `s` | CurrentWorkingDir, timer widgets | Edit segments or short time |
| `t` | CustomCommand | Edit timeout |
| **`u`** | **ContextPercentage, ContextPercentageUsable, Link** | **Used/remaining toggle or edit URL** |
| `v` | Skills, usage progress widgets | View mode or invert fill |
| `w` | CustomCommand, speed widgets | Edit width or window |

### Available (Not Currently Used)

| Key | Status |
|-----|--------|
| `b` | ✅ Available |
| `g` | ✅ Available (avoid - could confuse with "git") |
| `j` | ✅ Available |
| `k` | ✅ Available |
| `q` | ✅ Available |
| `x` | ✅ Available |
| `y` | ✅ Available |
| `z` | ✅ Available |

## Decision for Rules Editor

**Chosen: `x` - e(x)ceptions**

Since `u` is already heavily used (ContextPercentage widgets, Link widget), we chose `x` as the keybind to open RulesEditor.

**Rationale:**
- **Mnemonic:** e(x)ceptions - rules are exceptions to base widget properties
- **Mental Model:** Matches how users think ("make an exception when percentage > 75")
- **Availability:** Unused by any widget or global keybind
- **Clarity:** Clear purpose - editing conditional property overrides

**Help text:** `(x) exceptions`

**Reserved:** `x` is now reserved for rules-related features
