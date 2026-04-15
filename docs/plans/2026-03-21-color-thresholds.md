# Color Thresholds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dynamic color thresholds to widgets based on numeric values, allowing colors to change (including hiding widgets) based on configurable ranges.

**Architecture:** Zero-invasion approach - no changes to Widget interface. New utilities extract numeric values from RenderContext, resolve colors from threshold ranges stored in widget metadata. TUI editor for configuring ranges.

**Tech Stack:** TypeScript, React/Ink (TUI), Vitest (testing)

**Spec:** `docs/specs/2026-03-21-color-thresholds-design.md`

---

## File Structure

| File | Type | Responsibility |
|------|------|----------------|
| `src/types/ColorRange.ts` | NEW | ColorRange interface, ColorDirection type |
| `src/utils/color-thresholds.ts` | NEW | Core utilities: parseColorRanges, resolveColorFromRanges, getWidgetNumericValue, widget registry |
| `src/utils/color-threshold-presets.ts` | NEW | Preset configurations (usage-3, usage-hidden, countdown-3, etc.) |
| `src/utils/renderer.ts` | MODIFY | Integrate color threshold resolution in both render functions |
| `src/tui/components/ColorRangesEditor.tsx` | NEW | Full TUI editor for color ranges |
| `src/tui/components/ItemsEditor.tsx` | MODIFY | Route to ColorRangesEditor, show threshold indicators |
| `src/tui/components/ColorMenu.tsx` | MODIFY | Add "hidden" color option |
| `src/types/RenderContext.ts` | MODIFY | Add gitData field |

---

## Task 1: ColorRange Type Definition

**Files:**
- Create: `src/types/ColorRange.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create ColorRange type file**

```typescript
// src/types/ColorRange.ts
export interface ColorRange {
    upTo?: number;
    color: string;
}

export type ColorDirection = 'ascending' | 'descending';
```

- [ ] **Step 2: Export from types index**

Add to `src/types/index.ts`:
```typescript
export type { ColorRange, ColorDirection } from './ColorRange';
```

- [ ] **Step 3: Verify types compile**

Run: `bun run lint`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/types/ColorRange.ts src/types/index.ts
git commit -m "feat(types): add ColorRange and ColorDirection types"
```

---

## Task 2: Core Utilities - Parsing and Resolution

**Files:**
- Create: `src/utils/__tests__/color-thresholds.test.ts`
- Create: `src/utils/color-thresholds.ts`

- [ ] **Step 1: Write tests for parseColorRanges**

```typescript
// src/utils/__tests__/color-thresholds.test.ts
import { describe, expect, it } from 'vitest';
import { parseColorRanges, parseColorDirection } from '../color-thresholds';

describe('parseColorRanges', () => {
    it('should return null for undefined metadata', () => {
        expect(parseColorRanges(undefined)).toBeNull();
    });

    it('should return null for missing colorRanges', () => {
        expect(parseColorRanges({})).toBeNull();
    });

    it('should return null for invalid JSON', () => {
        expect(parseColorRanges({ colorRanges: 'not json' })).toBeNull();
    });

    it('should return null for empty array', () => {
        expect(parseColorRanges({ colorRanges: '[]' })).toBeNull();
    });

    it('should parse valid ranges', () => {
        const metadata = {
            colorRanges: '[{"upTo":50,"color":"green"},{"color":"red"}]'
        };
        const result = parseColorRanges(metadata);
        expect(result).toEqual([
            { upTo: 50, color: 'green' },
            { color: 'red' }
        ]);
    });

    it('should sort unsorted ranges', () => {
        const metadata = {
            colorRanges: '[{"upTo":75,"color":"yellow"},{"upTo":25,"color":"green"},{"color":"red"}]'
        };
        const result = parseColorRanges(metadata);
        expect(result).toEqual([
            { upTo: 25, color: 'green' },
            { upTo: 75, color: 'yellow' },
            { color: 'red' }
        ]);
    });

    it('should keep only one unbounded range', () => {
        const metadata = {
            colorRanges: '[{"color":"red"},{"color":"blue"},{"upTo":50,"color":"green"}]'
        };
        const result = parseColorRanges(metadata);
        expect(result).toEqual([
            { upTo: 50, color: 'green' },
            { color: 'red' }
        ]);
    });
});

describe('parseColorDirection', () => {
    it('should return ascending by default', () => {
        expect(parseColorDirection(undefined)).toBe('ascending');
        expect(parseColorDirection({})).toBe('ascending');
    });

    it('should return descending when specified', () => {
        expect(parseColorDirection({ colorDirection: 'descending' })).toBe('descending');
    });

    it('should return ascending for invalid values', () => {
        expect(parseColorDirection({ colorDirection: 'invalid' })).toBe('ascending');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/utils/__tests__/color-thresholds.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement parsing functions**

```typescript
// src/utils/color-thresholds.ts
import type { ColorRange, ColorDirection } from '../types/ColorRange';

export type { ColorRange, ColorDirection };

export function normalizeRanges(ranges: ColorRange[]): ColorRange[] {
    const bounded = ranges.filter(r => r.upTo !== undefined);
    const unbounded = ranges.filter(r => r.upTo === undefined);

    bounded.sort((a, b) => (a.upTo ?? 0) - (b.upTo ?? 0));

    return [...bounded, ...unbounded.slice(0, 1)];
}

export function parseColorRanges(
    metadata?: Record<string, string>
): ColorRange[] | null {
    const raw = metadata?.colorRanges;
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        if (parsed.length === 0) return null;

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

        return normalizeRanges(validated);
    } catch {
        return null;
    }
}

export function parseColorDirection(
    metadata?: Record<string, string>
): ColorDirection {
    const raw = metadata?.colorDirection;
    if (raw === 'descending') return 'descending';
    return 'ascending';
}

export function serializeColorRanges(ranges: ColorRange[]): string {
    return JSON.stringify(ranges);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/utils/__tests__/color-thresholds.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/color-thresholds.ts src/utils/__tests__/color-thresholds.test.ts
git commit -m "feat(color-thresholds): add parsing utilities"
```

---

## Task 3: Color Resolution Function

**Files:**
- Modify: `src/utils/__tests__/color-thresholds.test.ts`
- Modify: `src/utils/color-thresholds.ts`

- [ ] **Step 1: Write tests for resolveColorFromRanges**

Add to test file:

```typescript
import { resolveColorFromRanges } from '../color-thresholds';

describe('resolveColorFromRanges', () => {
    const ranges: ColorRange[] = [
        { upTo: 25, color: 'green' },
        { upTo: 50, color: 'yellow' },
        { upTo: 75, color: 'orange' },
        { color: 'red' }
    ];

    it('should return null for empty ranges', () => {
        expect(resolveColorFromRanges(50, [])).toBeNull();
    });

    it('should return first color for value at lower bound', () => {
        expect(resolveColorFromRanges(0, ranges)).toBe('green');
    });

    it('should return first color for value at threshold', () => {
        expect(resolveColorFromRanges(25, ranges)).toBe('green');
    });

    it('should return second color for value just above first threshold', () => {
        expect(resolveColorFromRanges(26, ranges)).toBe('yellow');
    });

    it('should return last color for value above all thresholds', () => {
        expect(resolveColorFromRanges(100, ranges)).toBe('red');
    });

    it('should handle single unbounded range', () => {
        expect(resolveColorFromRanges(50, [{ color: 'blue' }])).toBe('blue');
    });

    it('should return hidden color when in hidden range', () => {
        const hiddenRanges: ColorRange[] = [
            { upTo: 50, color: 'hidden' },
            { color: 'red' }
        ];
        expect(resolveColorFromRanges(25, hiddenRanges)).toBe('hidden');
        expect(resolveColorFromRanges(75, hiddenRanges)).toBe('red');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/utils/__tests__/color-thresholds.test.ts`
Expected: FAIL - resolveColorFromRanges not exported

- [ ] **Step 3: Implement resolveColorFromRanges**

Add to `src/utils/color-thresholds.ts`:

```typescript
export function resolveColorFromRanges(
    value: number,
    ranges: ColorRange[]
): string | null {
    if (ranges.length === 0) {
        return null;
    }

    for (const range of ranges) {
        if (range.upTo === undefined || value <= range.upTo) {
            return range.color;
        }
    }

    return ranges[ranges.length - 1]?.color ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/utils/__tests__/color-thresholds.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/color-thresholds.ts src/utils/__tests__/color-thresholds.test.ts
git commit -m "feat(color-thresholds): add resolveColorFromRanges"
```

---

## Task 4: RenderContext gitData Field

**Files:**
- Modify: `src/types/RenderContext.ts`

- [ ] **Step 1: Add gitData interface to RenderContext**

In `src/types/RenderContext.ts`, add the gitData field to the interface:

```typescript
export interface RenderContext {
    // ... existing fields ...

    // For git widget thresholds
    gitData?: {
        changedFiles?: number;
        insertions?: number;
        deletions?: number;
    };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run lint`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/types/RenderContext.ts
git commit -m "feat(types): add gitData field to RenderContext"
```

---

## Task 5: Numeric Widget Registry

**Files:**
- Modify: `src/utils/__tests__/color-thresholds.test.ts`
- Modify: `src/utils/color-thresholds.ts`

- [ ] **Step 1: Write tests for widget registry**

Add to test file:

```typescript
import {
    supportsColorThresholds,
    getWidgetNumericValue,
    getWidgetUnit,
    getDefaultRanges
} from '../color-thresholds';
import type { RenderContext } from '../../types';

describe('supportsColorThresholds', () => {
    it('should return true for percentage widgets', () => {
        expect(supportsColorThresholds('context-percentage')).toBe(true);
        expect(supportsColorThresholds('session-usage')).toBe(true);
        expect(supportsColorThresholds('context-bar')).toBe(true);
    });

    it('should return true for git widgets', () => {
        expect(supportsColorThresholds('git-changes')).toBe(true);
        expect(supportsColorThresholds('git-insertions')).toBe(true);
        expect(supportsColorThresholds('git-deletions')).toBe(true);
    });

    it('should return true for timer widgets', () => {
        expect(supportsColorThresholds('block-timer')).toBe(true);
        expect(supportsColorThresholds('block-reset-timer')).toBe(true);
        expect(supportsColorThresholds('weekly-reset-timer')).toBe(true);
    });

    it('should return true for cost widgets', () => {
        expect(supportsColorThresholds('session-cost')).toBe(true);
    });

    it('should return false for unsupported widgets', () => {
        expect(supportsColorThresholds('model')).toBe(false);
        expect(supportsColorThresholds('git-branch')).toBe(false);
        expect(supportsColorThresholds('unknown')).toBe(false);
    });
});

describe('getWidgetUnit', () => {
    it('should return percentage for percentage widgets', () => {
        expect(getWidgetUnit('context-percentage')).toBe('percentage');
        expect(getWidgetUnit('session-usage')).toBe('percentage');
    });

    it('should return tokens for context-length', () => {
        expect(getWidgetUnit('context-length')).toBe('tokens');
    });

    it('should return files for git-changes', () => {
        expect(getWidgetUnit('git-changes')).toBe('files');
    });

    it('should return lines for git-insertions', () => {
        expect(getWidgetUnit('git-insertions')).toBe('lines');
    });

    it('should return seconds for timers', () => {
        expect(getWidgetUnit('block-timer')).toBe('seconds');
    });

    it('should return dollars for session-cost', () => {
        expect(getWidgetUnit('session-cost')).toBe('dollars');
    });

    it('should return null for unsupported widgets', () => {
        expect(getWidgetUnit('model')).toBeNull();
    });
});

describe('getWidgetNumericValue', () => {
    it('should return session usage from context', () => {
        const context: RenderContext = {
            usageData: { sessionUsage: 45.5 }
        };
        expect(getWidgetNumericValue('session-usage', context, {} as any)).toBe(45.5);
    });

    it('should return git changes from gitData', () => {
        const context: RenderContext = {
            gitData: { changedFiles: 12 }
        };
        expect(getWidgetNumericValue('git-changes', context, {} as any)).toBe(12);
    });

    it('should return null for missing data', () => {
        const context: RenderContext = {};
        expect(getWidgetNumericValue('session-usage', context, {} as any)).toBeNull();
    });

    it('should return null for unsupported widgets', () => {
        const context: RenderContext = {};
        expect(getWidgetNumericValue('model', context, {} as any)).toBeNull();
    });
});

describe('getDefaultRanges', () => {
    it('should return ascending percentage ranges', () => {
        const ranges = getDefaultRanges('context-percentage', 'ascending');
        expect(ranges).toBeDefined();
        expect(ranges![0].color).toBe('green');
    });

    it('should return descending percentage ranges', () => {
        const ranges = getDefaultRanges('context-percentage', 'descending');
        expect(ranges).toBeDefined();
        expect(ranges![0].color).toBe('red');
    });

    it('should return file count ranges for git widgets', () => {
        const ranges = getDefaultRanges('git-changes', 'ascending');
        expect(ranges).toBeDefined();
        expect(ranges![0].upTo).toBe(5);
    });

    it('should return null for unsupported widgets', () => {
        expect(getDefaultRanges('model', 'ascending')).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/utils/__tests__/color-thresholds.test.ts`
Expected: FAIL - functions not exported

- [ ] **Step 3: Implement widget registry with all range constants**

Add to `src/utils/color-thresholds.ts` (after imports, before exports):

```typescript
import type { RenderContext } from '../types/RenderContext';
import type { WidgetItem } from '../types/Widget';
import { getContextWindowMetrics } from './context-window';
import { getContextConfig, getModelContextIdentifier } from './model-context';

interface NumericWidgetInfo {
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

// File/line count ranges
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
        { upTo: 60, color: 'red' },
        { upTo: 300, color: 'yellow' },
        { color: 'green' }
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

// Helper: get git change count from context
function getGitChangeCount(ctx: RenderContext): number | null {
    return ctx.gitData?.changedFiles ?? null;
}

// Helper: get timer seconds remaining
function getTimerSeconds(ctx: RenderContext, timerType: 'block' | 'blockReset' | 'weeklyReset'): number | null {
    const blockMetrics = ctx.blockMetrics;

    switch (timerType) {
        case 'block':
            return blockMetrics?.secondsRemaining ?? null;
        case 'blockReset':
            return blockMetrics?.secondsUntilReset ?? null;
        case 'weeklyReset':
            return ctx.usageData?.weeklySecondsUntilReset ?? null;
    }
    return null;
}

const NUMERIC_WIDGETS: Record<string, NumericWidgetInfo> = {
    // Context widgets
    'context-percentage': {
        getValue: (ctx) => computeContextPercentage(ctx),
        unit: 'percentage',
        defaultRanges: PERCENTAGE_RANGES
    },
    'context-percentage-usable': {
        getValue: (ctx) => {
            const pct = computeContextPercentage(ctx);
            if (pct === null) return null;
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

    // Usage widgets
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

    // Git widgets
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

    // Timer widgets
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

    // Cost widget
    'session-cost': {
        getValue: (ctx) => ctx.usageData?.sessionCost ?? null,
        unit: 'dollars',
        defaultRanges: COST_RANGES
    }
};

export function supportsColorThresholds(widgetType: string): boolean {
    return widgetType in NUMERIC_WIDGETS;
}

export function getWidgetNumericValue(
    widgetType: string,
    context: RenderContext,
    item: WidgetItem
): number | null {
    const info = NUMERIC_WIDGETS[widgetType];
    if (!info) return null;
    return info.getValue(context, item);
}

export function getWidgetUnit(widgetType: string): string | null {
    return NUMERIC_WIDGETS[widgetType]?.unit ?? null;
}

export function getDefaultRanges(
    widgetType: string,
    direction: ColorDirection
): ColorRange[] | null {
    const info = NUMERIC_WIDGETS[widgetType];
    if (!info) return null;
    return info.defaultRanges[direction];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/utils/__tests__/color-thresholds.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/color-thresholds.ts src/utils/__tests__/color-thresholds.test.ts
git commit -m "feat(color-thresholds): add complete numeric widget registry"
```

---

## Task 6: Presets

**Files:**
- Create: `src/utils/color-threshold-presets.ts`
- Create: `src/utils/__tests__/color-threshold-presets.test.ts`

- [ ] **Step 1: Write tests for presets**

```typescript
// src/utils/__tests__/color-threshold-presets.test.ts
import { describe, expect, it } from 'vitest';
import {
    THRESHOLD_PRESETS,
    getPresetNames,
    getPreset
} from '../color-threshold-presets';

describe('THRESHOLD_PRESETS', () => {
    it('should have usage-3 preset', () => {
        expect(THRESHOLD_PRESETS['usage-3']).toBeDefined();
        expect(THRESHOLD_PRESETS['usage-3'].ranges.length).toBe(3);
    });

    it('should have usage-hidden preset with hidden color', () => {
        const preset = THRESHOLD_PRESETS['usage-hidden'];
        expect(preset).toBeDefined();
        expect(preset.ranges[0].color).toBe('hidden');
    });

    it('should have countdown-3 with descending direction', () => {
        const preset = THRESHOLD_PRESETS['countdown-3'];
        expect(preset.direction).toBe('descending');
    });
});

describe('getPresetNames', () => {
    it('should return array of preset names', () => {
        const names = getPresetNames();
        expect(names).toContain('usage-3');
        expect(names).toContain('usage-hidden');
        expect(names).toContain('countdown-3');
    });
});

describe('getPreset', () => {
    it('should return preset by name', () => {
        const preset = getPreset('usage-3');
        expect(preset).toBeDefined();
        expect(preset?.name).toBe('3-Level Usage');
    });

    it('should return undefined for unknown preset', () => {
        expect(getPreset('unknown')).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/utils/__tests__/color-threshold-presets.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement presets**

```typescript
// src/utils/color-threshold-presets.ts
import type { ColorRange, ColorDirection } from '../types/ColorRange';

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
        ranges: []
    }
};

export function getPresetNames(): string[] {
    return Object.keys(THRESHOLD_PRESETS);
}

export function getPreset(name: string): ThresholdPreset | undefined {
    return THRESHOLD_PRESETS[name];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/utils/__tests__/color-threshold-presets.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/color-threshold-presets.ts src/utils/__tests__/color-threshold-presets.test.ts
git commit -m "feat(color-thresholds): add preset configurations"
```

---

## Task 7: Renderer Integration

**Files:**
- Create: `src/utils/__tests__/renderer-thresholds.test.ts`
- Modify: `src/utils/renderer.ts`

- [ ] **Step 1: Write integration test for threshold resolution**

```typescript
// src/utils/__tests__/renderer-thresholds.test.ts
import { describe, expect, it } from 'vitest';
import type { RenderContext, Settings, WidgetItem } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { preRenderAllWidgets, renderStatusLine } from '../renderer';

describe('renderer with color thresholds', () => {
    const baseContext: RenderContext = {
        usageData: { sessionUsage: 80 },
        terminalWidth: 120,
        isPreview: false
    };

    it('should apply threshold color when value exceeds threshold', () => {
        const widgets: WidgetItem[] = [{
            id: '1',
            type: 'session-usage',
            metadata: {
                colorRanges: '[{"upTo":50,"color":"green"},{"upTo":75,"color":"yellow"},{"color":"red"}]'
            }
        }];
        const settings: Settings = { ...DEFAULT_SETTINGS, lines: [widgets] };
        const preRendered = preRenderAllWidgets([widgets], settings, baseContext);

        const result = renderStatusLine(widgets, settings, baseContext, preRendered[0], []);

        // Should contain red color code (usage is 80%, above 75% threshold)
        expect(result).toContain('\x1b['); // Has ANSI codes
    });

    it('should hide widget when color is hidden', () => {
        const widgets: WidgetItem[] = [{
            id: '1',
            type: 'session-usage',
            metadata: {
                colorRanges: '[{"upTo":90,"color":"hidden"},{"color":"red"}]'
            }
        }];
        const settings: Settings = { ...DEFAULT_SETTINGS, lines: [widgets] };
        const context: RenderContext = { ...baseContext, usageData: { sessionUsage: 50 } };
        const preRendered = preRenderAllWidgets([widgets], settings, context);

        const result = renderStatusLine(widgets, settings, context, preRendered[0], []);

        // Widget should be hidden (value 50 is below 90 threshold)
        expect(result).toBe('');
    });

    it('should use static color when no ranges configured', () => {
        const widgets: WidgetItem[] = [{
            id: '1',
            type: 'session-usage',
            color: 'cyan'
        }];
        const settings: Settings = { ...DEFAULT_SETTINGS, lines: [widgets] };
        const preRendered = preRenderAllWidgets([widgets], settings, baseContext);

        const result = renderStatusLine(widgets, settings, baseContext, preRendered[0], []);

        // Should still render with cyan color
        expect(result).toContain('\x1b[');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/utils/__tests__/renderer-thresholds.test.ts`
Expected: FAIL - threshold logic not implemented

- [ ] **Step 3: Add import to renderer.ts**

Add at top of `src/utils/renderer.ts`:

```typescript
import {
    getWidgetNumericValue,
    parseColorRanges,
    resolveColorFromRanges
} from './color-thresholds';
```

- [ ] **Step 4: Integrate thresholds in renderStatusLine**

In `src/utils/renderer.ts`, inside the widget processing loop (around line 710-725), after getting `widgetText` and `defaultColor`, add:

```typescript
// Resolve color from thresholds if configured
let effectiveColor = widget.color ?? defaultColor;
const ranges = parseColorRanges(widget.metadata);

if (ranges) {
    const numericValue = getWidgetNumericValue(widget.type, context, widget);
    if (numericValue !== null) {
        const resolvedColor = resolveColorFromRanges(numericValue, ranges);

        if (resolvedColor === 'hidden') {
            continue; // Skip this widget
        }

        if (resolvedColor !== null) {
            effectiveColor = resolvedColor;
        }
    }
}
```

Then update the color application to use `effectiveColor` instead of `widget.color ?? defaultColor`.

- [ ] **Step 5: Integrate thresholds in renderPowerlineStatusLine**

Apply same pattern in `renderPowerlineStatusLine` (around line 190-210).

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test src/utils/__tests__/renderer-thresholds.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Run full test suite**

Run: `bun test`
Expected: All existing tests still pass

- [ ] **Step 8: Commit**

```bash
git add src/utils/renderer.ts src/utils/__tests__/renderer-thresholds.test.ts
git commit -m "feat(renderer): integrate color threshold resolution"
```

---

## Task 8: ColorRangesEditor Component

**Files:**
- Create: `src/tui/components/ColorRangesEditor.tsx`

- [ ] **Step 1: Create basic component structure**

```typescript
// src/tui/components/ColorRangesEditor.tsx
import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

import type { ColorDirection, ColorRange } from '../../types/ColorRange';
import type { WidgetItem } from '../../types/Widget';
import {
    getDefaultRanges,
    getWidgetUnit,
    parseColorDirection,
    parseColorRanges,
    serializeColorRanges
} from '../../utils/color-thresholds';
import { getPreset, getPresetNames } from '../../utils/color-threshold-presets';

export interface ColorRangesEditorProps {
    widget: WidgetItem;
    widgetType: string;
    widgetDisplayName: string;
    onSave: (updatedWidget: WidgetItem) => void;
    onCancel: () => void;
}

export const ColorRangesEditor: React.FC<ColorRangesEditorProps> = ({
    widget,
    widgetType,
    widgetDisplayName,
    onSave,
    onCancel
}) => {
    const existingRanges = parseColorRanges(widget.metadata);
    const existingDirection = parseColorDirection(widget.metadata);

    const [ranges, setRanges] = useState<ColorRange[]>(
        existingRanges ?? getDefaultRanges(widgetType, 'ascending') ?? []
    );
    const [direction, setDirection] = useState<ColorDirection>(existingDirection);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [presetIndex, setPresetIndex] = useState(-1);
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [colorPickerIndex, setColorPickerIndex] = useState(0);

    const unit = getWidgetUnit(widgetType) ?? 'value';
    const presetNames = getPresetNames();

    // Available colors including 'hidden'
    const availableColors = [
        'hidden', 'green', 'brightGreen', 'yellow', 'brightYellow',
        'red', 'brightRed', 'blue', 'cyan', 'magenta', 'white'
    ];

    const handleSave = () => {
        const updatedWidget: WidgetItem = {
            ...widget,
            metadata: {
                ...(widget.metadata ?? {}),
                colorRanges: ranges.length > 0 ? serializeColorRanges(ranges) : '',
                colorDirection: direction
            }
        };
        // Clean up empty metadata
        if (!updatedWidget.metadata?.colorRanges) {
            delete updatedWidget.metadata?.colorRanges;
        }
        onSave(updatedWidget);
    };

    useInput((input, key) => {
        // Color picker mode
        if (colorPickerOpen) {
            if (key.escape) {
                setColorPickerOpen(false);
                return;
            }
            if (key.leftArrow && colorPickerIndex > 0) {
                setColorPickerIndex(colorPickerIndex - 1);
            }
            if (key.rightArrow && colorPickerIndex < availableColors.length - 1) {
                setColorPickerIndex(colorPickerIndex + 1);
            }
            if (key.return) {
                // Apply selected color
                const newRanges = [...ranges];
                const current = newRanges[selectedIndex];
                if (current) {
                    current.color = availableColors[colorPickerIndex] ?? 'green';
                    setRanges(newRanges);
                }
                setColorPickerOpen(false);
            }
            return;
        }

        if (key.escape) {
            handleSave();
            return;
        }

        // Open color picker with Enter
        if (key.return && ranges[selectedIndex]) {
            const currentColor = ranges[selectedIndex]?.color ?? 'green';
            const idx = availableColors.indexOf(currentColor);
            setColorPickerIndex(idx >= 0 ? idx : 0);
            setColorPickerOpen(true);
            return;
        }

        if (key.upArrow && selectedIndex > 0) {
            setSelectedIndex(selectedIndex - 1);
        }
        if (key.downArrow && selectedIndex < ranges.length - 1) {
            setSelectedIndex(selectedIndex + 1);
        }

        // Adjust threshold with left/right
        if ((key.leftArrow || key.rightArrow) && ranges[selectedIndex]?.upTo !== undefined) {
            const delta = key.shift ? 1 : 5;
            const change = key.leftArrow ? -delta : delta;
            const newRanges = [...ranges];
            const current = newRanges[selectedIndex];
            if (current?.upTo !== undefined) {
                current.upTo = Math.max(0, current.upTo + change);
                setRanges(newRanges);
            }
        }

        // Toggle direction
        if (input === 't') {
            setDirection(direction === 'ascending' ? 'descending' : 'ascending');
        }

        // Cycle presets
        if (input === 'p') {
            const nextIndex = (presetIndex + 1) % presetNames.length;
            setPresetIndex(nextIndex);
            const preset = getPreset(presetNames[nextIndex] ?? '');
            if (preset) {
                setRanges(preset.ranges);
                setDirection(preset.direction);
            }
        }

        // Add range
        if (input === 'a' && ranges.length > 0) {
            const current = ranges[selectedIndex];
            if (current?.upTo !== undefined) {
                const midpoint = Math.floor(current.upTo / 2);
                const newRange: ColorRange = { upTo: midpoint, color: 'green' };
                const newRanges = [...ranges];
                newRanges.splice(selectedIndex, 0, newRange);
                setRanges(newRanges);
            }
        }

        // Delete range
        if (input === 'd' && ranges.length > 1) {
            const newRanges = ranges.filter((_, i) => i !== selectedIndex);
            setRanges(newRanges);
            if (selectedIndex >= newRanges.length) {
                setSelectedIndex(newRanges.length - 1);
            }
        }

        // Reverse colors
        if (input === 'r') {
            const colors = ranges.map(r => r.color);
            colors.reverse();
            const newRanges = ranges.map((r, i) => ({ ...r, color: colors[i] ?? r.color }));
            setRanges(newRanges);
        }
    });

    const getRangeDisplay = (range: ColorRange, index: number, prevUpTo: number): string => {
        const start = prevUpTo;
        const end = range.upTo !== undefined ? range.upTo : '+';
        return `${start} - ${end}`;
    };

    return (
        <Box flexDirection="column" padding={1}>
            <Box marginBottom={1}>
                <Text bold>Color Ranges ({widgetDisplayName})</Text>
            </Box>

            <Box marginBottom={1}>
                <Text>Direction: </Text>
                <Text color="cyan">[{direction} {direction === 'ascending' ? '^' : 'v'}]</Text>
                <Text dimColor>  Unit: {unit}</Text>
            </Box>

            <Box flexDirection="column" marginBottom={1}>
                <Text>Ranges:</Text>
                {ranges.map((range, index) => {
                    const prevUpTo = index === 0 ? 0 : (ranges[index - 1]?.upTo ?? 0);
                    const isSelected = index === selectedIndex;
                    const rangeDisplay = getRangeDisplay(range, index, prevUpTo);

                    return (
                        <Box key={index}>
                            <Text color={isSelected ? 'cyan' : undefined}>
                                {isSelected ? '> ' : '  '}
                            </Text>
                            <Text>{rangeDisplay.padEnd(12)}</Text>
                            <Text color={range.color === 'hidden' ? 'gray' : range.color}>
                                [{range.color}]
                            </Text>
                        </Box>
                    );
                })}
            </Box>

            {colorPickerOpen && (
                <Box marginBottom={1}>
                    <Text>Color: </Text>
                    {availableColors.map((color, i) => (
                        <Text
                            key={color}
                            color={color === 'hidden' ? 'gray' : color}
                            inverse={i === colorPickerIndex}
                        >
                            {' '}{color}{' '}
                        </Text>
                    ))}
                </Box>
            )}

            <Box flexDirection="column">
                {colorPickerOpen ? (
                    <Text dimColor>[{'<>'}] select color  [enter] apply  [esc] cancel</Text>
                ) : (
                    <>
                        <Text dimColor>[a]dd  [d]elete  [enter] color  [{'<>'}] adjust</Text>
                        <Text dimColor>[p]reset  [r]everse  [t]oggle direction  [esc] save</Text>
                    </>
                )}
            </Box>
        </Box>
    );
};
```

- [ ] **Step 2: Verify component compiles**

Run: `bun run lint`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/tui/components/ColorRangesEditor.tsx
git commit -m "feat(tui): add ColorRangesEditor component"
```

---

## Task 9: ItemsEditor Integration

**Files:**
- Modify: `src/tui/components/ItemsEditor.tsx`
- Modify: `src/tui/components/index.ts`

- [ ] **Step 1: Export ColorRangesEditor from index**

Add to `src/tui/components/index.ts`:

```typescript
export { ColorRangesEditor } from './ColorRangesEditor';
```

- [ ] **Step 2: Import threshold utilities in ItemsEditor**

Add imports to `src/tui/components/ItemsEditor.tsx`:

```typescript
import {
    parseColorDirection,
    parseColorRanges,
    supportsColorThresholds
} from '../../utils/color-thresholds';
import { ColorRangesEditor } from './ColorRangesEditor';
```

- [ ] **Step 3: Add color ranges editor state**

Add to component state:

```typescript
const [colorRangesWidget, setColorRangesWidget] = useState<WidgetItem | null>(null);
```

- [ ] **Step 4: Add threshold indicator function**

Add helper function:

```typescript
const getColorDisplay = (widget: WidgetItem): string => {
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
};
```

- [ ] **Step 5: Route color keybind to appropriate editor**

In the input handler, when 'c' is pressed for color:

```typescript
if (input === 'c') {
    const selectedWidget = widgets[selectedIndex];
    if (selectedWidget && supportsColorThresholds(selectedWidget.type)) {
        setColorRangesWidget(selectedWidget);
    } else {
        // Existing color menu logic
    }
}
```

- [ ] **Step 6: Render ColorRangesEditor when active**

Add conditional render:

```typescript
if (colorRangesWidget) {
    const widgetImpl = getWidget(colorRangesWidget.type);
    return (
        <ColorRangesEditor
            widget={colorRangesWidget}
            widgetType={colorRangesWidget.type}
            widgetDisplayName={widgetImpl?.getDisplayName() ?? colorRangesWidget.type}
            onSave={(updated) => {
                const newWidgets = [...widgets];
                const idx = widgets.findIndex(w => w.id === updated.id);
                if (idx >= 0) {
                    newWidgets[idx] = updated;
                    onUpdate(newWidgets);
                }
                setColorRangesWidget(null);
            }}
            onCancel={() => setColorRangesWidget(null)}
        />
    );
}
```

- [ ] **Step 7: Update widget display to show threshold indicator**

In the widget list rendering, use `getColorDisplay(widget)` instead of just showing the color.

- [ ] **Step 8: Verify it compiles and run TUI**

Run: `bun run lint && bun run start`
Expected: TUI launches, can navigate to items editor

- [ ] **Step 9: Commit**

```bash
git add src/tui/components/ItemsEditor.tsx src/tui/components/index.ts
git commit -m "feat(tui): integrate ColorRangesEditor in ItemsEditor"
```

---

## Task 10: Add Hidden Color Option

**Files:**
- Modify: `src/tui/components/ColorMenu.tsx`

- [ ] **Step 1: Add hidden to color options**

In `src/tui/components/ColorMenu.tsx`, add "hidden" to the available colors when used from ColorRangesEditor. Create an exported function:

```typescript
export function getColorsWithHidden(): { name: string; value: string }[] {
    return [
        { name: 'Hidden', value: 'hidden' },
        ...getAvailableColorsForUI()
    ];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run lint`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/tui/components/ColorMenu.tsx
git commit -m "feat(tui): add hidden color option"
```

---

## Task 11: Manual Testing & Polish

**Files:** Various

- [ ] **Step 1: Test threshold color changes**

Run: `bun run start`
1. Navigate to Line 1 > Items
2. Add "Session Usage" widget
3. Press 'c' for color
4. Configure thresholds: 50/75 with green/yellow/red
5. Save and verify preview shows dynamic colors

- [ ] **Step 2: Test hidden functionality**

1. Set first range (0-50) to "hidden"
2. Verify widget disappears in preview when value is low
3. Verify widget appears when value exceeds threshold

- [ ] **Step 3: Test presets**

1. Press 'p' to cycle through presets
2. Verify each preset applies correctly
3. Test "usage-hidden" preset

- [ ] **Step 4: Test direction toggle**

1. Press 't' to toggle direction
2. Verify indicator changes (^ to v)
3. Press 'r' to reverse colors
4. Verify colors are reversed

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 6: Run lint**

Run: `bun run lint`
Expected: No errors

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(color-thresholds): complete implementation with tests"
```

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | ColorRange type definition | 5 min |
| 2 | Parsing utilities | 15 min |
| 3 | Resolution function | 10 min |
| 4 | RenderContext gitData field | 5 min |
| 5 | Widget registry (all 13 widgets) | 25 min |
| 6 | Presets | 10 min |
| 7 | Renderer integration | 20 min |
| 8 | ColorRangesEditor component (with color picker) | 30 min |
| 9 | ItemsEditor integration | 20 min |
| 10 | Hidden color option | 5 min |
| 11 | Manual testing & polish | 15 min |

**Total estimated time:** ~2.5 hours
