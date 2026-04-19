import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { AgentEntry } from '../types/AgentActivityMetrics';
import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import type { WidgetHookDef } from '../utils/hooks';
import { shouldInsertInput } from '../utils/input-guards';

import { makeModifierText } from './shared/editor-display';
import {
    isMetadataFlagEnabled,
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

const LIMIT_DEFAULT = 3;

const HIDE_MODEL_KEY = 'hideModel';
const HIDE_DESCRIPTION_KEY = 'hideDescription';
const HIDE_ELAPSED_KEY = 'hideElapsed';
const HIDE_COMPLETED_KEY = 'hideCompleted';
const HIDE_WHEN_EMPTY_KEY = 'hideWhenEmpty';
const LIMIT_KEY = 'limit';

const CYCLE_MODE_ACTION = 'cycle-mode';
const TOGGLE_HIDE_MODEL_ACTION = 'toggle-hide-model';
const TOGGLE_HIDE_DESCRIPTION_ACTION = 'toggle-hide-description';
const TOGGLE_HIDE_ELAPSED_ACTION = 'toggle-hide-elapsed';
const TOGGLE_HIDE_COMPLETED_ACTION = 'toggle-hide-completed';
const TOGGLE_HIDE_EMPTY_ACTION = 'toggle-hide-empty';
const EDIT_LIMIT_ACTION = 'edit-limit';

export function formatElapsed(startTime: Date, endTime: Date | undefined, now: Date = new Date()): string {
    const endMs = (endTime ?? now).getTime();
    const ms = Math.max(0, endMs - startTime.getTime());

    if (ms < 1000)
        return '<1s';
    if (ms < 60_000)
        return `${Math.round(ms / 1000)}s`;

    const totalSecs = Math.floor(ms / 1000);
    const totalMins = Math.floor(totalSecs / 60);

    if (totalMins < 60) {
        const secs = totalSecs % 60;
        return `${totalMins}m ${secs}s`;
    }

    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hours}h ${mins}m`;
}

function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen)
        return text;
    return `${text.slice(0, maxLen - 3)}...`;
}

export interface AgentDisplayFlags {
    hideModel: boolean;
    hideDescription: boolean;
    hideElapsed: boolean;
}

export function formatAgent(
    agent: AgentEntry,
    flags: AgentDisplayFlags,
    rawValue: boolean,
    now: Date = new Date()
): string {
    const icon = agent.status === 'running' ? '◐' : '✓';
    const type = agent.type;
    const model = !flags.hideModel && agent.model
        ? ` [${agent.model}]`
        : '';
    const desc = !flags.hideDescription && agent.description
        ? `: ${truncate(agent.description, 40)}`
        : '';
    const elapsed = !flags.hideElapsed
        ? ` (${formatElapsed(agent.startTime, agent.endTime, now)})`
        : '';
    const body = `${type}${model}${desc}${elapsed}`;
    return rawValue ? body : `${icon} ${body}`;
}

export function filterByMode(agents: AgentEntry[], mode: Mode, hideCompleted = false): AgentEntry[] {
    if (mode === 'current') {
        const last = agents[agents.length - 1];
        return last === undefined ? [] : [last];
    }
    if (mode === 'activity' && hideCompleted) {
        return agents.filter(a => a.status === 'running');
    }
    return agents;
}

export function applyLimit(agents: AgentEntry[], limit: number): AgentEntry[] {
    if (limit === 0)
        return agents;
    return agents.slice(-limit);
}

export class AgentActivityWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string {
        return 'Shows Task subagents: running + recent completed, with model and elapsed time';
    }

    getDisplayName(): string { return 'Agent Activity'; }
    getCategory(): string { return 'Session'; }
    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }

    getHooks(): WidgetHookDef[] {
        return [
            { event: 'PreToolUse', matcher: 'Agent' },
            { event: 'PostToolUse', matcher: 'Agent' }
        ];
    }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const mode = this.getMode(item);
        const modifiers: string[] = [MODE_LABELS[mode]];

        const rawLimit = item.metadata?.[LIMIT_KEY];
        if (rawLimit !== undefined && (mode === 'list' || mode === 'activity')) {
            const parsed = parseInt(rawLimit, 10);
            if (!Number.isNaN(parsed) && parsed >= 0 && parsed !== LIMIT_DEFAULT) {
                modifiers.push(`limit: ${parsed === 0 ? '∞' : parsed}`);
            }
        }

        if (mode === 'activity' && this.shouldHideCompleted(item)) {
            modifiers.push('running only');
        }

        if (this.shouldHideModel(item)) {
            modifiers.push('no model');
        }
        if (this.shouldHideDescription(item)) {
            modifiers.push('no desc');
        }
        if (this.shouldHideElapsed(item)) {
            modifiers.push('no elapsed');
        }

        if (this.isHideWhenEmptyEnabled(item)) {
            modifiers.push('hide when empty');
        }

        return {
            displayText: 'Agent Activity',
            modifierText: makeModifierText(modifiers)
        };
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const keybinds: CustomKeybind[] = [
            { key: 'v', label: '(v)iew: current/count/list/activity', action: CYCLE_MODE_ACTION },
            { key: 'm', label: '(m)odel', action: TOGGLE_HIDE_MODEL_ACTION },
            { key: 'd', label: '(d)escription', action: TOGGLE_HIDE_DESCRIPTION_ACTION },
            { key: 'e', label: '(e)lapsed', action: TOGGLE_HIDE_ELAPSED_ACTION },
            { key: 'h', label: '(h)ide when empty', action: TOGGLE_HIDE_EMPTY_ACTION }
        ];

        if (item) {
            const mode = this.getMode(item);
            if (mode === 'list' || mode === 'activity') {
                keybinds.push({ key: 'l', label: '(l)imit', action: EDIT_LIMIT_ACTION });
            }
            if (mode === 'activity') {
                keybinds.push({ key: 'r', label: '(r)unning only', action: TOGGLE_HIDE_COMPLETED_ACTION });
            }
        }

        return keybinds;
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_MODE_ACTION) {
            const currentMode = this.getMode(item);
            const nextIndex = (MODES.indexOf(currentMode) + 1) % MODES.length;
            const nextMode = MODES[nextIndex] ?? 'activity';
            return { ...item, metadata: { ...item.metadata, mode: nextMode } };
        }
        if (action === TOGGLE_HIDE_MODEL_ACTION) {
            return toggleMetadataFlag(item, HIDE_MODEL_KEY);
        }
        if (action === TOGGLE_HIDE_DESCRIPTION_ACTION) {
            return toggleMetadataFlag(item, HIDE_DESCRIPTION_KEY);
        }
        if (action === TOGGLE_HIDE_ELAPSED_ACTION) {
            return toggleMetadataFlag(item, HIDE_ELAPSED_KEY);
        }
        if (action === TOGGLE_HIDE_COMPLETED_ACTION) {
            return toggleMetadataFlag(item, HIDE_COMPLETED_KEY);
        }
        if (action === TOGGLE_HIDE_EMPTY_ACTION) {
            return toggleMetadataFlag(item, HIDE_WHEN_EMPTY_KEY);
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const mode = this.getMode(item);
        const rawValue = item.rawValue === true;
        const hideWhenEmpty = this.isHideWhenEmptyEnabled(item);
        const hideCompleted = this.shouldHideCompleted(item);

        if (context.isPreview) {
            return this.renderPreview(mode, rawValue, hideCompleted);
        }

        const allAgents = context.agentActivityMetrics?.agents ?? [];

        if (mode === 'count') {
            const total = allAgents.length;
            if (hideWhenEmpty && total === 0)
                return null;
            return rawValue ? String(total) : `Agents: ${total}`;
        }

        if (mode === 'list') {
            const byType = new Map<string, number>();
            for (const a of allAgents) {
                byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
            }
            if (byType.size === 0) {
                if (hideWhenEmpty)
                    return null;
                return rawValue ? '' : 'Agents: none';
            }
            const entries = [...byType.entries()].sort((a, b) => {
                if (b[1] !== a[1])
                    return b[1] - a[1];
                return a[0].localeCompare(b[0]);
            });
            const limit = this.parseLimit(item);
            const visible = limit > 0 ? entries.slice(0, limit) : entries;
            const body = visible.map(([name, count]) => `${name} ×${count}`).join(', ');
            return rawValue ? body : `Agents: ${body}`;
        }

        const filtered = filterByMode(allAgents, mode, hideCompleted);

        if (filtered.length === 0) {
            if (hideWhenEmpty)
                return null;
            return rawValue ? '' : 'Agents: none';
        }

        const limit = mode === 'current' ? 1 : this.parseLimit(item);
        const limited = applyLimit(filtered, limit);
        const now = new Date();
        const flags: AgentDisplayFlags = {
            hideModel: this.shouldHideModel(item),
            hideDescription: this.shouldHideDescription(item),
            hideElapsed: this.shouldHideElapsed(item)
        };
        const parts = limited.map(agent => formatAgent(agent, flags, rawValue, now));
        const separator = mode === 'activity' && hideCompleted ? ', ' : ' | ';
        const joined = parts.join(separator);

        return rawValue ? joined : `Agents: ${joined}`;
    }

    private renderPreview(mode: Mode, rawValue: boolean, hideCompleted: boolean): string {
        if (mode === 'count') {
            return rawValue ? '3' : 'Agents: 3';
        }
        if (mode === 'list') {
            const body = 'explore ×2, code-reviewer ×1';
            return rawValue ? body : `Agents: ${body}`;
        }
        if (mode === 'current') {
            return rawValue
                ? 'code-reviewer [opus]: Review complete (2m 34s)'
                : 'Agents: ✓ code-reviewer [opus]: Review complete (2m 34s)';
        }
        if (hideCompleted) {
            return rawValue
                ? 'explore [haiku]: Finding auth code (12s)'
                : 'Agents: ◐ explore [haiku]: Finding auth code (12s)';
        }
        return rawValue
            ? 'explore [haiku]: Finding auth code (12s) | code-reviewer [opus]: Review complete (2m 34s)'
            : 'Agents: ◐ explore [haiku]: Finding auth code (12s) | ✓ code-reviewer [opus]: Review complete (2m 34s)';
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <AgentActivityEditor {...props} />;
    }

    private getMode(item: WidgetItem): Mode {
        const raw = item.metadata?.mode;
        if (raw === 'last')
            return 'current';
        if (raw === 'mixed' || raw === 'active')
            return 'activity';
        return raw !== undefined && (MODES as string[]).includes(raw) ? raw as Mode : 'activity';
    }

    private parseLimit(item: WidgetItem): number {
        const raw = item.metadata?.[LIMIT_KEY];
        if (raw === undefined)
            return LIMIT_DEFAULT;
        const parsed = parseInt(raw, 10);
        if (Number.isNaN(parsed) || parsed < 0)
            return LIMIT_DEFAULT;
        return parsed;
    }

    private shouldHideModel(item: WidgetItem): boolean {
        return isMetadataFlagEnabled(item, HIDE_MODEL_KEY);
    }

    private shouldHideDescription(item: WidgetItem): boolean {
        return isMetadataFlagEnabled(item, HIDE_DESCRIPTION_KEY);
    }

    private shouldHideElapsed(item: WidgetItem): boolean {
        return isMetadataFlagEnabled(item, HIDE_ELAPSED_KEY);
    }

    private shouldHideCompleted(item: WidgetItem): boolean {
        if (item.metadata?.mode === 'active')
            return true;
        return isMetadataFlagEnabled(item, HIDE_COMPLETED_KEY);
    }

    private isHideWhenEmptyEnabled(item: WidgetItem): boolean {
        return isMetadataFlagEnabled(item, HIDE_WHEN_EMPTY_KEY);
    }
}

const AgentActivityEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
    const currentLimit = (() => {
        const raw = widget.metadata?.[LIMIT_KEY];
        if (raw === undefined) {
            return LIMIT_DEFAULT;
        }
        const parsed = parseInt(raw, 10);
        return Number.isNaN(parsed) || parsed < 0 ? LIMIT_DEFAULT : parsed;
    })();
    const [limitInput, setLimitInput] = useState(currentLimit.toString());

    useInput((input, key) => {
        if (action !== EDIT_LIMIT_ACTION) {
            return;
        }

        if (key.return) {
            const parsed = parseInt(limitInput, 10);
            if (Number.isNaN(parsed) || parsed < 0) {
                onCancel();
                return;
            }
            onComplete({
                ...widget,
                metadata: {
                    ...widget.metadata,
                    [LIMIT_KEY]: parsed.toString()
                }
            });
        } else if (key.escape) {
            onCancel();
        } else if (key.backspace) {
            setLimitInput(limitInput.slice(0, -1));
        } else if (shouldInsertInput(input, key) && /\d/.test(input)) {
            setLimitInput(limitInput + input);
        }
    });

    if (action === EDIT_LIMIT_ACTION) {
        return (
            <Box flexDirection='column'>
                <Box>
                    <Text>Enter max agents to show (0 for unlimited): </Text>
                    <Text>{limitInput}</Text>
                    <Text backgroundColor='gray' color='black'>{' '}</Text>
                </Box>
                <Text dimColor>Press Enter to save, ESC to cancel</Text>
            </Box>
        );
    }

    return <Text>Unknown editor mode</Text>;
};