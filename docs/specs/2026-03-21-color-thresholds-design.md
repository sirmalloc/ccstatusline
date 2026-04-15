# Color Thresholds Design Spec

## Overview

Add dynamic color thresholds to widgets based on their numeric values. Widgets can change color (including becoming hidden) based on configurable value ranges.

## Goals

- Allow widgets to display different colors based on their current value
- Support hiding widgets until a threshold is reached
- Configurable number of ranges (not fixed 3-level)
- Support both ascending (high=bad) and descending (low=bad) semantics
- Zero changes to existing Widget interface or widget implementations
- Fully backward compatible

## Data Model

### ColorRange Interface

```typescript
// src/types/ColorRange.ts

interface ColorRange {
  upTo?: number;      // Raw numeric value. undefined = final range (no upper bound)
  color: string;      // Color name or "hidden"
}

type ColorDirection = 'ascending' | 'descending';
```

### Direction Semantics

The `colorDirection` field affects:
1. **Default preset selection** - ascending uses green→yellow→red, descending uses red→yellow→green
2. **TUI hints** - shows "high=bad" vs "low=bad" indicator
3. **Reverse operation** - knows which way to flip colors

It does NOT affect resolution logic. Ranges are always evaluated in ascending order by `upTo` value. The user defines what colors mean for their use case.

### Special Color: "hidden"

The color value `"hidden"` is a reserved keyword that causes the widget to be skipped during rendering. This enables "show only when threshold exceeded" behavior.

### Widget Metadata Storage

Stored in existing `metadata: Record<string, string>` field:

```typescript
metadata: {
  colorRanges?: string;      // JSON-encoded ColorRange[]
  colorDirection?: string;   // "ascending" | "descending", defaults to "ascending"
}
```

Example configurations:

```typescript
// Hide below 25%, green 25-50, yellow 50-75, red 75+
{
  colorRanges: '[{"upTo":25,"color":"hidden"},{"upTo":50,"color":"green"},{"upTo":75,"color":"yellow"},{"color":"red"}]',
  colorDirection: 'ascending'
}

// Git changes: green up to 5, yellow 5-20, red 20+
{
  colorRanges: '[{"upTo":5,"color":"green"},{"upTo":20,"color":"yellow"},{"color":"red"}]',
  colorDirection: 'ascending'
}

// Countdown timer: red when low, green when plenty of time
{
  colorRanges: '[{"upTo":300,"color":"red"},{"upTo":900,"color":"yellow"},{"color":"green"}]',
  colorDirection: 'descending'
}
```

## Utility Functions

### New File: `src/utils/color-thresholds.ts`

```typescript
import type { RenderContext } from '../types/RenderContext';
import type { WidgetItem } from '../types/Widget';
import type { ColorRange, ColorDirection } from '../types/ColorRange';
import { getContextWindowMetrics } from './context-window';
import { getContextConfig, getModelContextIdentifier } from './model-context';

// Re-export types for convenience
export type { ColorRange, ColorDirection };

export interface NumericWidgetInfo {
  getValue: (context: RenderContext, item: WidgetItem) => number | null;
  unit: string;
  defaultRanges: {
    ascending: ColorRange[];
    descending: ColorRange[];
  };
}

// Standard percentage ranges (0-100)
const PERCENTAGE_RANGES = {
  ascending: [
    { upTo: 50, color: 'green' },
    { upTo: 75, color: 'yellow' },
    { color: 'red' }
  ],
  descending: [
    { upTo: 25, color: 'red' },
    { upTo: 50, color: 'yellow' },
    { color: 'green' }
  ]
};

// Standard file count ranges
const FILE_COUNT_RANGES = {
  ascending: [
    { upTo: 5, color: 'green' },
    { upTo: 20, color: 'yellow' },
    { color: 'red' }
  ],
  descending: [
    { upTo: 5, color: 'red' },
    { upTo: 20, color: 'yellow' },
    { color: 'green' }
  ]
};

// Time ranges (in seconds) - 5min warning, 1min critical
const TIME_RANGES = {
  ascending: [
    { upTo: 300, color: 'green' },
    { upTo: 60, color: 'yellow' },
    { color: 'red' }
  ],
  descending: [
    { upTo: 60, color: 'red' },
    { upTo: 300, color: 'yellow' },
    { color: 'green' }
  ]
};

// Cost ranges (in dollars)
const COST_RANGES = {
  ascending: [
    { upTo: 0.5, color: 'green' },
    { upTo: 2.0, color: 'yellow' },
    { color: 'red' }
  ],
  descending: [
    { upTo: 0.5, color: 'red' },
    { upTo: 2.0, color: 'yellow' },
    { color: 'green' }
  ]
};

// Token count ranges
const TOKEN_RANGES = {
  ascending: [
    { upTo: 50000, color: 'green' },
    { upTo: 150000, color: 'yellow' },
    { color: 'red' }
  ],
  descending: [
    { upTo: 50000, color: 'red' },
    { upTo: 150000, color: 'yellow' },
    { color: 'green' }
  ]
};

// Helper: compute context percentage from RenderContext
function computeContextPercentage(ctx: RenderContext): number | null {
  const metrics = getContextWindowMetrics(ctx.data);
  if (metrics.usedPercentage !== null) {
    return metrics.usedPercentage;
  }
  if (ctx.tokenMetrics) {
    const modelId = getModelContextIdentifier(ctx.data?.model);
    const config = getContextConfig(modelId, metrics.windowSize);
    return Math.min(100, (ctx.tokenMetrics.contextLength / config.maxTokens) * 100);
  }
  return null;
}

// Helper: parse git change count from pre-rendered context
function getGitChangeCount(ctx: RenderContext): number | null {
  // Git data is parsed during widget render and stored in context
  // For threshold evaluation, we need to access the same data
  const gitData = ctx.gitData;
  if (!gitData) return null;
  return gitData.changedFiles ?? null;
}

// Helper: get timer seconds remaining
function getTimerSeconds(ctx: RenderContext, timerType: 'block' | 'blockReset' | 'weeklyReset'): number | null {
  const blockMetrics = ctx.blockMetrics;
  if (!blockMetrics) return null;

  switch (timerType) {
    case 'block':
      return blockMetrics.secondsRemaining ?? null;
    case 'blockReset':
      return blockMetrics.secondsUntilReset ?? null;
    case 'weeklyReset':
      return ctx.usageData?.weeklySecondsUntilReset ?? null;
  }
  return null;
}

// Registry of widgets that support numeric values
const NUMERIC_WIDGETS: Record<string, NumericWidgetInfo> = {
  'context-percentage': {
    getValue: (ctx) => computeContextPercentage(ctx),
    unit: 'percentage',
    defaultRanges: PERCENTAGE_RANGES
  },
  'context-percentage-usable': {
    getValue: (ctx) => {
      const pct = computeContextPercentage(ctx);
      if (pct === null) return null;
      // Usable is 80% of total, so scale accordingly
      return Math.min(100, pct * 1.25);
    },
    unit: 'percentage',
    defaultRanges: PERCENTAGE_RANGES
  },
  'context-bar': {
    getValue: (ctx) => computeContextPercentage(ctx),
    unit: 'percentage',
    defaultRanges: PERCENTAGE_RANGES
  },
  'context-length': {
    getValue: (ctx) => ctx.tokenMetrics?.contextLength ?? null,
    unit: 'tokens',
    defaultRanges: TOKEN_RANGES
  },
  'session-usage': {
    getValue: (ctx) => ctx.usageData?.sessionUsage ?? null,
    unit: 'percentage',
    defaultRanges: PERCENTAGE_RANGES
  },
  'weekly-usage': {
    getValue: (ctx) => ctx.usageData?.weeklyUsage ?? null,
    unit: 'percentage',
    defaultRanges: PERCENTAGE_RANGES
  },
  'git-changes': {
    getValue: (ctx) => getGitChangeCount(ctx),
    unit: 'files',
    defaultRanges: FILE_COUNT_RANGES
  },
  'git-insertions': {
    getValue: (ctx) => ctx.gitData?.insertions ?? null,
    unit: 'lines',
    defaultRanges: FILE_COUNT_RANGES
  },
  'git-deletions': {
    getValue: (ctx) => ctx.gitData?.deletions ?? null,
    unit: 'lines',
    defaultRanges: FILE_COUNT_RANGES
  },
  'block-timer': {
    getValue: (ctx) => getTimerSeconds(ctx, 'block'),
    unit: 'seconds',
    defaultRanges: TIME_RANGES
  },
  'block-reset-timer': {
    getValue: (ctx) => getTimerSeconds(ctx, 'blockReset'),
    unit: 'seconds',
    defaultRanges: TIME_RANGES
  },
  'weekly-reset-timer': {
    getValue: (ctx) => getTimerSeconds(ctx, 'weeklyReset'),
    unit: 'seconds',
    defaultRanges: TIME_RANGES
  },
  'session-cost': {
    getValue: (ctx) => ctx.usageData?.sessionCost ?? null,
    unit: 'dollars',
    defaultRanges: COST_RANGES
  }
};

// Check if widget supports numeric values
export function supportsColorThresholds(widgetType: string): boolean {
  return widgetType in NUMERIC_WIDGETS;
}

// Get numeric value for a widget
export function getWidgetNumericValue(
  widgetType: string,
  context: RenderContext,
  item: WidgetItem
): number | null {
  const info = NUMERIC_WIDGETS[widgetType];
  if (!info) return null;
  return info.getValue(context, item);
}

// Get widget unit for display
export function getWidgetUnit(widgetType: string): string | null {
  return NUMERIC_WIDGETS[widgetType]?.unit ?? null;
}

// Get default ranges for a widget
export function getDefaultRanges(
  widgetType: string,
  direction: ColorDirection
): ColorRange[] | null {
  const info = NUMERIC_WIDGETS[widgetType];
  if (!info) return null;
  return info.defaultRanges[direction];
}

// Resolve color from ranges based on value
// NOTE: Ranges must be sorted in ascending order by upTo value.
// The direction config affects preset selection and UI hints, not resolution logic.
export function resolveColorFromRanges(
  value: number,
  ranges: ColorRange[]
): string | null {
  // Empty ranges = use static color (return null to signal fallback)
  if (ranges.length === 0) {
    return null;
  }

  for (const range of ranges) {
    if (range.upTo === undefined || value <= range.upTo) {
      return range.color;
    }
  }
  // Fallback to last range (should have upTo: undefined)
  return ranges[ranges.length - 1]?.color ?? null;
}

// Validate and sort ranges (ensures ascending order)
export function normalizeRanges(ranges: ColorRange[]): ColorRange[] {
  // Separate ranges with upTo from the final "catch-all" range
  const bounded = ranges.filter(r => r.upTo !== undefined);
  const unbounded = ranges.filter(r => r.upTo === undefined);

  // Sort bounded ranges by upTo value ascending
  bounded.sort((a, b) => (a.upTo ?? 0) - (b.upTo ?? 0));

  // Append unbounded (final) range at the end
  return [...bounded, ...unbounded.slice(0, 1)]; // Only keep one unbounded
}

// Parse colorRanges from metadata with validation
export function parseColorRanges(
  metadata?: Record<string, string>
): ColorRange[] | null {
  const raw = metadata?.colorRanges;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    if (parsed.length === 0) return null; // Empty = use static color

    // Validate structure
    const validated: ColorRange[] = [];
    for (const range of parsed) {
      if (typeof range !== 'object' || range === null) return null;
      if (range.upTo !== undefined && typeof range.upTo !== 'number') return null;
      if (typeof range.color !== 'string' || range.color.length === 0) return null;

      validated.push({
        upTo: range.upTo,
        color: range.color
      });
    }

    // Normalize (sort) before returning
    return normalizeRanges(validated);
  } catch {
    // Invalid JSON - fall back to static color
    return null;
  }
}

// Parse direction from metadata
export function parseColorDirection(
  metadata?: Record<string, string>
): ColorDirection {
  const raw = metadata?.colorDirection;
  if (raw === 'descending') return 'descending';
  return 'ascending';
}

// Serialize ranges to metadata
export function serializeColorRanges(ranges: ColorRange[]): string {
  return JSON.stringify(ranges);
}
```

### Presets

```typescript
// src/utils/color-threshold-presets.ts

export interface ThresholdPreset {
  name: string;
  direction: ColorDirection;
  ranges: ColorRange[];
}

export const THRESHOLD_PRESETS: Record<string, ThresholdPreset> = {
  'usage-3': {
    name: '3-Level Usage',
    direction: 'ascending',
    ranges: [
      { upTo: 50, color: 'green' },
      { upTo: 75, color: 'yellow' },
      { color: 'red' }
    ]
  },
  'usage-hidden': {
    name: 'Hidden Until 50%',
    direction: 'ascending',
    ranges: [
      { upTo: 50, color: 'hidden' },
      { upTo: 75, color: 'yellow' },
      { color: 'red' }
    ]
  },
  'usage-4': {
    name: '4-Level Usage',
    direction: 'ascending',
    ranges: [
      { upTo: 25, color: 'green' },
      { upTo: 50, color: 'brightGreen' },
      { upTo: 75, color: 'yellow' },
      { color: 'red' }
    ]
  },
  'countdown-3': {
    name: '3-Level Countdown',
    direction: 'descending',
    ranges: [
      { upTo: 25, color: 'red' },
      { upTo: 50, color: 'yellow' },
      { color: 'green' }
    ]
  },
  'static': {
    name: 'Static Color',
    direction: 'ascending',
    ranges: []  // Empty = use static color
  }
};
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty ranges array | Use static `item.color` (no threshold behavior) |
| Invalid JSON in metadata | Use static `item.color` (graceful fallback) |
| Ranges not sorted | Auto-sorted by `normalizeRanges()` during parse |
| Multiple unbounded ranges | Only first unbounded range kept |
| Numeric value is null | Use static `item.color` (widget doesn't support thresholds in this context) |
| Widget render() returns null | Widget hidden regardless of thresholds (threshold check happens after render) |
| Threshold check with preview mode | Uses preview numeric values for consistent display |

## Renderer Integration

### Modifications to `src/utils/renderer.ts`

Add import at top of file:

```typescript
import {
  parseColorRanges,
  getWidgetNumericValue,
  resolveColorFromRanges
} from './color-thresholds';
```

In both `renderStatusLine` and `renderPowerlineStatusLine`, modify widget processing loop.

**Location in renderStatusLine:** Inside the `for` loop starting at line ~652, after getting `preRendered` content but before applying colors.

**Location in renderPowerlineStatusLine:** Inside the `for` loop starting at line ~142, after getting `widgetText` but before building `widgetElements`.

```typescript
// EXISTING: Get widget content
const widgetImpl = getWidget(widget.type);
const widgetText = preRendered?.content ?? '';
const defaultColor = widgetImpl?.getDefaultColor() ?? 'white';

// NEW: Resolve color from thresholds if configured
let effectiveColor = widget.color ?? defaultColor;
const ranges = parseColorRanges(widget.metadata);

if (ranges) {
  // Only call getValue if we have ranges to check
  const numericValue = getWidgetNumericValue(widget.type, context, widget);
  if (numericValue !== null) {
    const resolvedColor = resolveColorFromRanges(numericValue, ranges);

    if (resolvedColor === 'hidden') {
      // Skip this widget entirely - don't add to elements
      continue;
    }

    if (resolvedColor !== null) {
      effectiveColor = resolvedColor;
    }
  }
  // If numericValue is null, fall through to use effectiveColor (static)
}

// EXISTING: Continue with color application using effectiveColor
// Replace: widget.color ?? defaultColor
// With: effectiveColor
```

## TUI Components

### New Component: `src/tui/components/ColorRangesEditor.tsx`

Full-screen editor for configuring color ranges.

**Props:**
```typescript
interface ColorRangesEditorProps {
  widget: WidgetItem;
  widgetType: string;
  onSave: (updatedWidget: WidgetItem) => void;
  onCancel: () => void;
}
```

**State:**
```typescript
interface EditorState {
  ranges: ColorRange[];
  direction: ColorDirection;
  selectedIndex: number;
  editingThreshold: boolean;
}
```

**Layout:**
```
+-- Color Ranges (Context %) -------------------+
|                                               |
|  Direction: [ascending ^]                     |
|                                               |
|  Ranges:                    Unit: percentage  |
|  +-------------------------------------------+|
|  | > 0 - 25      [hidden]                    ||
|  |   25 - 50     [green]                     ||
|  |   50 - 75     [yellow]                    ||
|  |   75+         [red]                       ||
|  +-------------------------------------------+|
|                                               |
|  [a]dd  [d]elete  [enter] color  [<>] adjust  |
|  [p]reset  [r]everse  [esc] save              |
|                                               |
+-----------------------------------------------+
```

**Keybindings:**

| Key | Action |
|-----|--------|
| `Up/Down` | Navigate between ranges |
| `Left/Right` | Adjust threshold value (+-5) |
| `Shift+Left/Right` | Adjust threshold value (+-1) |
| `Enter` | Open color picker for selected range |
| `a` | Add new range (splits current at midpoint) |
| `d` | Delete selected range (merges with adjacent) |
| `p` | Cycle through presets |
| `r` | Reverse all colors (swap first and last, etc.) |
| `t` | Toggle direction (ascending/descending) |
| `Esc` | Save and close |

### Modifications to `src/tui/components/ItemsEditor.tsx`

1. Show indicator for widgets with color ranges:

```typescript
// In widget display:
function getColorDisplay(widget: WidgetItem): string {
  const ranges = parseColorRanges(widget.metadata);
  if (ranges && ranges.length > 0) {
    const direction = parseColorDirection(widget.metadata);
    const thresholds = ranges
      .filter(r => r.upTo !== undefined)
      .map(r => r.upTo)
      .join('/');
    const arrow = direction === 'ascending' ? '^' : 'v';
    return `[${thresholds} ${arrow}]`;
  }
  return `[${widget.color ?? 'default'}]`;
}
```

2. Route to correct editor based on widget support:

```typescript
// When user presses color keybind:
if (supportsColorThresholds(selectedWidget.type)) {
  // Open ColorRangesEditor
  setScreen('color-ranges-editor');
} else {
  // Open existing ColorMenu
  setScreen('color-menu');
}
```

### Modifications to `src/tui/components/ColorMenu.tsx`

Add "hidden" as a color option (for use within ranges editor):

```typescript
const COLORS_WITH_HIDDEN = [
  { name: 'Hidden', value: 'hidden' },
  ...getAvailableColorsForUI()
];
```

## RenderContext Extension

The `RenderContext` type needs optional fields for git and timer data that some widgets use:

```typescript
// In src/types/RenderContext.ts - add optional fields:
interface RenderContext {
  // ... existing fields ...

  // For git widget thresholds
  gitData?: {
    changedFiles?: number;
    insertions?: number;
    deletions?: number;
  };

  // blockMetrics already exists, but ensure these fields:
  blockMetrics?: {
    secondsRemaining?: number;
    secondsUntilReset?: number;
    // ... existing fields ...
  };
}
```

Note: These fields may already be populated by existing code paths. Implementation should verify and add population logic if needed.

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/types/ColorRange.ts` | NEW | ColorRange interface, ColorDirection type |
| `src/types/RenderContext.ts` | MODIFY | Add gitData field for threshold evaluation |
| `src/utils/color-thresholds.ts` | NEW | Core utilities, numeric widget registry |
| `src/utils/color-threshold-presets.ts` | NEW | Preset configurations |
| `src/utils/renderer.ts` | MODIFY | Integrate color range resolution |
| `src/tui/components/ColorRangesEditor.tsx` | NEW | TUI editor component |
| `src/tui/components/ItemsEditor.tsx` | MODIFY | Routing, indicator display |
| `src/tui/components/ColorMenu.tsx` | MODIFY | Add "hidden" option |

## Supported Widgets (Initial)

| Widget | Unit | Notes |
|--------|------|-------|
| `context-percentage` | percentage | 0-100 |
| `context-percentage-usable` | percentage | 0-100 |
| `context-bar` | percentage | 0-100 |
| `context-length` | tokens | Raw count |
| `session-usage` | percentage | 0-100 |
| `weekly-usage` | percentage | 0-100 |
| `git-changes` | files | Count |
| `git-insertions` | lines | Count |
| `git-deletions` | lines | Count |
| `block-timer` | seconds | Time remaining |
| `block-reset-timer` | seconds | Time until reset |
| `weekly-reset-timer` | seconds | Time until reset |
| `session-cost` | dollars | Accumulated cost |

## Backward Compatibility

- No changes to Widget interface
- No changes to existing widget implementations
- Widgets without `colorRanges` metadata behave exactly as before
- Settings version bump not required (metadata is freeform)
- Existing configurations remain valid

## Out of Scope

- Custom formulas for value extraction
- Time-of-day based thresholds
- Export/import of threshold configs
- Per-range background colors (uses widget's backgroundColor)
- Animated transitions between colors

## Testing Considerations

1. Unit tests for `color-thresholds.ts`:
   - `parseColorRanges` with valid/invalid JSON
   - `resolveColorFromRanges` with various values
   - `getWidgetNumericValue` for each supported widget

2. Integration tests:
   - Renderer skips widgets when color is "hidden"
   - Renderer applies correct color based on value
   - Powerline mode handles hidden widgets

3. TUI tests:
   - ColorRangesEditor keyboard navigation
   - Preset application
   - Save/cancel behavior
