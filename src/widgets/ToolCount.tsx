import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type { ToolActivityEntry } from '../types/ToolCountMetrics';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import type { WidgetHookDef } from '../utils/hooks';
import { shouldInsertInput } from '../utils/input-guards';
import { basename } from '../utils/tool-count';

import { makeModifierText } from './shared/editor-display';
import {
    isMetadataFlagEnabled,
    removeMetadataKeys,
    toggleMetadataFlag
} from './shared/metadata';

type Mode = 'current' | 'count' | 'list' | 'activity';
const MODES: Mode[] = ['current', 'count', 'list', 'activity'];
const MODE_LABELS: Record<Mode, string> = {
    current: 'current',
    count: 'count',
    list: 'list',
    activity: 'activity'
};

const ACTIVITY_TOP_DEFAULT = 3;

type Scope = 'all' | 'builtin' | 'mcp';
const SCOPES: Scope[] = ['all', 'builtin', 'mcp'];
const SCOPE_LABELS: Record<Scope, string> = { all: 'all', builtin: 'builtin', mcp: 'mcp' };

const HIDE_WHEN_EMPTY_KEY = 'hideWhenEmpty';
const HIDE_COMPLETED_KEY = 'hideCompleted';
const LIST_LIMIT_KEY = 'listLimit';
const SCOPE_KEY = 'scope';
const TOGGLE_HIDE_EMPTY_ACTION = 'toggle-hide-empty';
const TOGGLE_HIDE_COMPLETED_ACTION = 'toggle-hide-completed';
const EDIT_LIST_LIMIT_ACTION = 'edit-list-limit';
const CYCLE_SCOPE_ACTION = 'cycle-scope';

function parseListLimit(item: WidgetItem): number {
    const parsed = parseInt(item.metadata?.[LIST_LIMIT_KEY] ?? '0', 10);
    if (Number.isNaN(parsed) || parsed < 0) {
        return 0;
    }
    return parsed;
}

function setListLimit(item: WidgetItem, limit: number): WidgetItem {
    if (limit <= 0) {
        const { [LIST_LIMIT_KEY]: removedLimit, ...restMetadata } = item.metadata ?? {};
        void removedLimit;
        return {
            ...item,
            metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
        };
    }

    return {
        ...item,
        metadata: {
            ...item.metadata,
            [LIST_LIMIT_KEY]: limit.toString()
        }
    };
}

export class ToolCountWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Counts Claude Code tool invocations (built-in + MCP) per session'; }
    getDisplayName(): string { return 'Tool Count'; }
    getCategory(): string { return 'Session'; }
    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }

    // PreToolUse drives current/count/list; PostToolUse adds end events that pair
    // with start events to power `activity` mode's running/completed distinction.
    // Shared/deduped with Skills' PreToolUse hook; handleHook routes by tool_name.
    getHooks(): WidgetHookDef[] {
        return [
            { event: 'PreToolUse' },
            { event: 'PostToolUse' }
        ];
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const keybinds: CustomKeybind[] = [
            { key: 'v', label: '(v)iew: current/count/list/activity', action: 'cycle-mode' },
            { key: 's', label: '(s)cope: all/builtin/mcp', action: CYCLE_SCOPE_ACTION },
            { key: 'h', label: '(h)ide when empty', action: TOGGLE_HIDE_EMPTY_ACTION }
        ];

        if (item) {
            const mode = this.getMode(item);
            if (mode === 'list' || mode === 'activity') {
                keybinds.push({ key: 'l', label: '(l)imit', action: EDIT_LIST_LIMIT_ACTION });
            }
            if (mode === 'activity') {
                keybinds.push({ key: 'r', label: '(r)unning only', action: TOGGLE_HIDE_COMPLETED_ACTION });
            }
        }

        return keybinds;
    }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const mode = this.getMode(item);
        const modifiers = [MODE_LABELS[mode]];
        const scope = this.getScope(item);
        if (scope !== 'all') {
            modifiers.push(`scope: ${SCOPE_LABELS[scope]}`);
        }
        if (mode === 'list' || mode === 'activity') {
            const limit = parseListLimit(item);
            if (limit > 0) {
                modifiers.push(`limit: ${limit}`);
            }
        }
        if (mode === 'activity' && this.shouldHideCompleted(item)) {
            modifiers.push('running only');
        }
        if (this.isHideWhenEmptyEnabled(item)) {
            modifiers.push('hide when empty');
        }
        return { displayText: 'Tools', modifierText: makeModifierText(modifiers) };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'cycle-mode') {
            const next = MODES[(MODES.indexOf(this.getMode(item)) + 1) % MODES.length] ?? 'current';
            const keepsLimit = next === 'list' || next === 'activity';
            const nextItem = keepsLimit ? item : removeMetadataKeys(item, [LIST_LIMIT_KEY]);
            return { ...nextItem, metadata: { ...nextItem.metadata, mode: next } };
        }
        if (action === CYCLE_SCOPE_ACTION) {
            const next = SCOPES[(SCOPES.indexOf(this.getScope(item)) + 1) % SCOPES.length] ?? 'all';
            if (next === 'all') {
                return removeMetadataKeys(item, [SCOPE_KEY]);
            }
            return { ...item, metadata: { ...item.metadata, [SCOPE_KEY]: next } };
        }
        if (action === TOGGLE_HIDE_COMPLETED_ACTION) {
            return toggleMetadataFlag(item, HIDE_COMPLETED_KEY);
        }
        if (action === TOGGLE_HIDE_EMPTY_ACTION) {
            return toggleMetadataFlag(item, HIDE_WHEN_EMPTY_KEY);
        }
        return null;
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <ToolCountEditor {...props} />;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const mode = this.getMode(item);
        const scope = this.getScope(item);
        const raw = item.rawValue;
        const hideWhenEmpty = this.isHideWhenEmptyEnabled(item);

        if (context.isPreview) {
            if (mode === 'current') {
                return raw ? 'Edit' : 'Tool: Edit';
            }
            if (mode === 'count') {
                return raw ? '42' : 'Tools: 42';
            }
            if (mode === 'activity') {
                const preview = '◐ Edit: auth.ts | ✓ Read ×3 | ✓ Bash ×2';
                return raw ? preview : `Tools: ${preview}`;
            }
            const preview = 'Bash ×5, Edit ×4, Read ×2, MCP ×1';
            return raw ? preview : `Tools: ${preview}`;
        }

        if (mode === 'current') {
            const lastTool = context.toolCountMetrics?.lastTool;
            if (!lastTool) {
                if (hideWhenEmpty) {
                    return null;
                }
                return raw ? 'none' : 'Tool: none';
            }
            return raw ? lastTool : `Tool: ${lastTool}`;
        }

        if (mode === 'count') {
            const total = this.getScopedTotal(context, scope);
            if (hideWhenEmpty && total === 0) {
                return null;
            }
            return raw ? String(total) : `Tools: ${total}`;
        }

        if (mode === 'activity') {
            const body = this.renderActivity(context, scope, parseListLimit(item), this.shouldHideCompleted(item));
            if (body === null) {
                if (hideWhenEmpty)
                    return null;
                return raw ? '' : 'Tools: none';
            }
            // Intentional: keep ◐/✓ icons even under rawValue — they are the only
            // running/completed signal (×N is completed-only, :target is running-only).
            return raw ? body : `Tools: ${body}`;
        }

        const filtered = this.getScopedUniqueTools(context, scope);
        if (filtered.length === 0) {
            if (hideWhenEmpty) {
                return null;
            }
            return raw ? 'none' : 'Tools: none';
        }

        const limit = parseListLimit(item);
        const visibleTools = limit > 0 ? filtered.slice(0, limit) : filtered;
        const list = visibleTools.join(', ');
        return raw ? list : `Tools: ${list}`;
    }

    private renderActivity(context: RenderContext, scope: Scope, configuredLimit: number, hideCompleted: boolean): string | null {
        const entries = context.toolCountMetrics?.activity ?? [];
        const filtered = entries.filter((e) => {
            if (e.tool_name === 'Agent')
                return false;
            if (scope === 'all')
                return true;
            if (scope === 'mcp')
                return e.category === 'mcp';
            return e.category === 'builtin';
        });
        if (filtered.length === 0)
            return null;

        const running: ToolActivityEntry[] = [];
        const completedCounts = new Map<string, number>();
        const lastEnd = new Map<string, number>();
        for (const entry of filtered) {
            if (entry.status === 'running') {
                running.push(entry);
            } else if (!hideCompleted) {
                completedCounts.set(entry.tool_name, (completedCounts.get(entry.tool_name) ?? 0) + 1);
                const endMs = entry.endTime?.getTime() ?? entry.startTime.getTime();
                lastEnd.set(entry.tool_name, Math.max(lastEnd.get(entry.tool_name) ?? 0, endMs));
            }
        }

        const topLimit = configuredLimit > 0 ? configuredLimit : ACTIVITY_TOP_DEFAULT;
        const topCompleted = [...completedCounts.entries()]
            .sort((a, b) => {
                if (b[1] !== a[1])
                    return b[1] - a[1];
                return (lastEnd.get(b[0]) ?? 0) - (lastEnd.get(a[0]) ?? 0);
            })
            .slice(0, topLimit);

        const runningParts = running.map((r) => {
            const targetPart = r.target ? `: ${basename(r.target)}` : '';
            return `◐ ${r.tool_name}${targetPart}`;
        });
        const completedParts = topCompleted.map(([name, count]) => (
            count > 1 ? `✓ ${name} ×${count}` : `✓ ${name}`
        ));

        const parts = [...runningParts, ...completedParts];
        return parts.length > 0 ? parts.join(' | ') : null;
    }

    private getScopedTotal(context: RenderContext, scope: Scope): number {
        const metrics = context.toolCountMetrics;
        if (!metrics) {
            return 0;
        }
        if (scope === 'all') {
            return metrics.totalInvocations;
        }
        return metrics.byCategory[scope];
    }

    private getScopedUniqueTools(context: RenderContext, scope: Scope): string[] {
        const metrics = context.toolCountMetrics;
        if (!metrics) {
            return [];
        }

        interface Entry {
            name: string;
            count: number;
            isMcp: boolean;
        }
        const builtinEntries: Entry[] = Object.entries(metrics.byTool)
            .filter(([name]) => !name.startsWith('mcp__'))
            .map(([name, count]) => ({ name, count, isMcp: false }));

        const mcpCount = metrics.byCategory.mcp;
        const mcpEntry: Entry | null = mcpCount > 0
            ? { name: 'MCP', count: mcpCount, isMcp: true }
            : null;

        let entries: Entry[];
        if (scope === 'builtin') {
            entries = builtinEntries;
        } else if (scope === 'mcp') {
            entries = mcpEntry ? [mcpEntry] : [];
        } else {
            entries = mcpEntry ? [...builtinEntries, mcpEntry] : builtinEntries;
        }

        entries.sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            if (a.isMcp !== b.isMcp) {
                return a.isMcp ? 1 : -1;
            }
            return a.name.localeCompare(b.name);
        });

        return entries.map(e => `${e.name} ×${e.count}`);
    }

    private getMode(item: WidgetItem): Mode {
        const mode = item.metadata?.mode;
        return mode && MODES.includes(mode as Mode) ? mode as Mode : 'current';
    }

    private getScope(item: WidgetItem): Scope {
        const scope = item.metadata?.[SCOPE_KEY];
        return scope && SCOPES.includes(scope as Scope) ? scope as Scope : 'all';
    }

    private isHideWhenEmptyEnabled(item: WidgetItem): boolean {
        return isMetadataFlagEnabled(item, HIDE_WHEN_EMPTY_KEY);
    }

    private shouldHideCompleted(item: WidgetItem): boolean {
        return isMetadataFlagEnabled(item, HIDE_COMPLETED_KEY);
    }
}

const ToolCountEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const [limitInput, setLimitInput] = useState(() => parseListLimit(widget).toString());

    useInput((input, key) => {
        if (action !== EDIT_LIST_LIMIT_ACTION) {
            return;
        }

        if (key.return) {
            const parsed = parseInt(limitInput, 10);
            const limit = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
            onComplete(setListLimit(widget, limit));
        } else if (key.escape) {
            onCancel();
        } else if (key.backspace) {
            setLimitInput(limitInput.slice(0, -1));
        } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
            setLimitInput(limitInput + input);
        }
    });

    if (action === EDIT_LIST_LIMIT_ACTION) {
        return (
            <Box flexDirection='column'>
                <Box>
                    <Text>Enter max tools to show (0 for unlimited): </Text>
                    <Text>{limitInput}</Text>
                    <Text backgroundColor='gray' color='black'>{' '}</Text>
                </Box>
                <Text dimColor>Press Enter to save, ESC to cancel</Text>
            </Box>
        );
    }

    return <Text>Unknown editor mode</Text>;
};