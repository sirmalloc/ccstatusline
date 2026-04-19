# ccstatusline Fork — Tip Widgets + TUI Config

**Created:** 2026-04-04
**Repo:** `E:/Coding/Projects/ccstatusline` (fork of sirmalloc/ccstatusline)
**Upstream:** https://github.com/sirmalloc/ccstatusline (MIT, Ink 6.2.0 + React 19, 186 source files, 39 widgets)
**Fork:** https://github.com/Avimarzan/ccstatusline

## Goal

Add tip rotation as a native ccstatusline feature. Two new widgets (`version-update`, `tip`), a config schema extension, and a TUI config screen. Once built, replaces `statusline-wrapper.sh`, our `config.json`, and `/avi-statusline-config` skill from the current Phase 1-3 system.

## Context

Phases 1-3 of the statusline tips system (in the claude-code-toolkit repo) built a working tip pipeline:
- `version-check.sh` (SessionStart hook) detects version changes, fetches changelog, writes per-version `tips_{version}.json` files
- `statusline-wrapper.sh` wraps ccstatusline, reads tip files, rotates tips, expires old files, right-aligns output

This works but has limitations: the wrapper is a bash+node shim bolted outside ccstatusline, config is a separate JSON file, and the config UI is a skill using AskUserQuestion. Moving tips into ccstatusline makes them first-class: native widget, native config, native TUI.

## What stays after migration
- `version-check.sh` — still the data source, writes `tips_{version}.json` on version change
- `tips_*.json` file format — unchanged, read by the new widgets instead of the wrapper

## What gets replaced
| Current (Phases 1-3) | After (fork) |
|---|---|
| `statusline-wrapper.sh` wraps ccstatusline, appends tips | Eliminated — tips are native widgets |
| Our `config.json` with 6 settings | ccstatusline's own config schema + TUI |
| `/avi-statusline-config` skill (AskUserQuestion menu) | ccstatusline's built-in TUI config screen |
| Right-alignment via node unicode width calc | ccstatusline's layout system |
| `.tip_index` rotation counter | Widget-internal state file |

## What gets built

### New widgets (2)

1. **`version-update`** — displays `Updated: vX.Y.Z → vA.B.C` from the latest (highest semver) non-expired tip file
   - Category: Session
   - Reads: `~/.claude/statusline/tips_*.json` (or configurable path)
   - Shows nothing if no tip files exist or all expired
   - Auto-deletes expired files on each render

2. **`tip`** — displays a rotating tip from the merged pool of all non-expired tip files
   - Category: Session
   - Reads: same tip files as version-update
   - Rotation: sequential, advances every N renders (configurable `rotateEvery`)
   - State: persists rotation counter to `~/.claude/statusline/.tip_index`
   - Shows nothing if pool is empty

### Config schema additions

```json
{
  "tips": {
    "enabled": true,
    "tipDir": "~/.claude/statusline",
    "rotateEvery": 5,
    "expiryDays": 7,
    "maxTipLength": 47,
    "minTips": 5
  }
}
```

### TUI config screen: "Tips"

Added as a new menu item in ccstatusline's main TUI menu (alongside Edit Lines, Colors, Powerline, etc.):
- Toggle enabled/disabled
- Edit rotateEvery, expiryDays, maxTipLength, minTips
- Browse all tips (grouped by version, with age)
- Generate tips (force re-fetch for current version)
- Rotate now (advance to next tip pair)
- Clear all (delete tip files + reset index)

## Tasks

- [x] **1. Fork + clone** — fork sirmalloc/ccstatusline to Avimarzan/ccstatusline. Clone to `E:/Coding/Projects/ccstatusline`. Upstream remote added.
- [x] **2. Implement `version-update` widget** — `src/widgets/VersionUpdate.ts`, registered in widget manifest. Reads tip files via `getLatestTipFile()`, renders "Updated: vX.Y.Z → vA.B.C". Handles: no files, all expired, malformed JSON. 7 tests passing.
- [x] **3. Implement `tip` widget** — `src/widgets/Tip.ts`, registered in manifest. Reads tip files, merges pool via `advanceTipRotation()`, rotates every N renders. Supports hideWhenEmpty metadata toggle. 7 tests passing.
- [x] **4. Add config schema** — `TipsSettingsSchema` added to `src/types/Settings.ts` (enabled, tipDir, rotateEvery, expiryDays, maxTipLength, minTips). `CURRENT_VERSION` bumped 3→4. v3→v4 migration in `src/utils/migrations.ts`. Types in `src/types/TipData.ts`.
- [x] **4b. Core tip utility** — `src/utils/tips.ts`: path helpers, sync storage (last-version, tip files, tip index), semver comparison, tip pool management, rotation, changelog fetch (GitHub API), tip generation (`claude --print`), pipeline orchestrator, expiry cleanup. 27 tests passing.
- [x] **4c. Hook handler extension** — `src/ccstatusline.ts` `handleHook()` extended: `version?` field on `HookInput`, version check runs on every hook call (independent of skill tracking), returns early when version unchanged.
- [x] **5. Add TUI config screen** — new component in `src/tui/components/TipsMenu.tsx`. Ink-based menu for tip settings + actions (browse, generate, rotate, clear). Added to main menu between Global Overrides and Install.
- [x] **6. Tests** — unit tests for both widgets + core utility (41 total tests, all passing). Covers storage, rotation, expiry, semver, edge cases. Existing test suite unaffected (579 pass, only pre-existing FreeMemory platform failures).
- [x] ~~**7. Publish fork**~~ — N/A, submitting upstream PR instead (task 10)
- [x] **8. Migration** — update `settings.json` to use forked version directly (no wrapper). Delete `statusline-wrapper.sh`, our `config.json`, `/avi-statusline-config` skill. Update `version-check.sh` tip dir if needed.
- [ ] **9. Update docs** — update plan_statusline_tips.md, infra_map.md, CLAUDE.md, todo_plan.md in claude-code-toolkit.
- [x] **10. Submit upstream PR** — submitted as sirmalloc/ccstatusline#287

## Syncing with upstream

We pin exact versions, so no surprise breakage. To pull upstream updates:
1. `git fetch upstream` + merge/rebase onto our feature branch
2. Resolve conflicts (likely none — our changes are additive: new widget files, schema extension, TUI screen)
3. Rebuild + republish

## Risks

- **Upstream drift** — mitigated by additive-only changes (new files, not modifying existing ones). Merge conflicts should be rare.
- **Scope creep** — keep it focused: 2 widgets + config + TUI screen. Don't refactor existing ccstatusline code.
- **Tip file path convention** — widgets default to `~/.claude/statusline/` but configurable in schema.
