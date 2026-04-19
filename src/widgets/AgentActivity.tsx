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

type Mode = 'mixed' | 'active' | 'last';
const MODES: Mode[] = ['mixed', 'active', 'last'];

const LIMIT_DEFAULT = 3;

const HIDE_MODEL_KEY = 'hideModel';
const HIDE_DESCRIPTION_KEY = 'hideDescription';
const HIDE_ELAPSED_KEY = 'hideElapsed';
const HIDE_WHEN_EMPTY_KEY = 'hideWhenEmpty';
const LIMIT_KEY = 'limit';

const CYCLE_MODE_ACTION = 'cycle-mode';
const TOGGLE_HIDE_MODEL_ACTION = 'toggle-hide-model';
const TOGGLE_HIDE_DESCRIPTION_ACTION = 'toggle-hide-description';
const TOGGLE_HIDE_ELAPSED_ACTION = 'toggle-hide-elapsed';
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

export function filterByMode(agents: AgentEntry[], mode: Mode): AgentEntry[] {
    if (mode === 'active') {
        return agents.filter(a => a.status === 'running');
    }
    if (mode === 'last') {
        const last = agents[agents.length - 1];
        return last === undefined ? [] : [last];
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
            { event: 'PreToolUse', matcher: 'Task' },
            { event: 'PostToolUse', matcher: 'Task' }
        ];
    }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers: string[] = [this.getMode(item)];

        const rawLimit = item.metadata?.[LIMIT_KEY];
        if (rawLimit !== undefined) {
            const parsed = parseInt(rawLimit, 10);
            if (!Number.isNaN(parsed) && parsed >= 0 && parsed !== LIMIT_DEFAULT) {
                modifiers.push(`limit: ${parsed === 0 ? '∞' : parsed}`);
            }
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
            { key: 'v', label: '(v)iew: mixed/active/last', action: CYCLE_MODE_ACTION },
            { key: 'm', label: '(m)odel', action: TOGGLE_HIDE_MODEL_ACTION },
            { key: 'd', label: '(d)escription', action: TOGGLE_HIDE_DESCRIPTION_ACTION },
            { key: 'e', label: '(e)lapsed', action: TOGGLE_HIDE_ELAPSED_ACTION },
            { key: 'h', label: '(h)ide when empty', action: TOGGLE_HIDE_EMPTY_ACTION }
        ];

        if (item && this.getMode(item) !== 'last') {
            keybinds.push({ key: 'l', label: '(l)imit', action: EDIT_LIMIT_ACTION });
        }

        return keybinds;
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_MODE_ACTION) {
            const currentMode = this.getMode(item);
            const nextIndex = (MODES.indexOf(currentMode) + 1) % MODES.length;
            const nextMode = MODES[nextIndex] ?? 'mixed';
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
        if (action === TOGGLE_HIDE_EMPTY_ACTION) {
            return toggleMetadataFlag(item, HIDE_WHEN_EMPTY_KEY);
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const mode = this.getMode(item);
        const rawValue = item.rawValue === true;
        const hideWhenEmpty = this.isHideWhenEmptyEnabled(item);

        if (context.isPreview) {
            return this.renderPreview(mode, rawValue);
        }

        const allAgents = context.agentActivityMetrics?.agents ?? [];
        const filtered = filterByMode(allAgents, mode);

        if (filtered.length === 0) {
            if (hideWhenEmpty)
                return null;
            return rawValue ? '' : 'Agents: none';
        }

        const limit = mode === 'last' ? 1 : this.parseLimit(item);
        const limited = applyLimit(filtered, limit);
        const now = new Date();
        const flags: AgentDisplayFlags = {
            hideModel: this.shouldHideModel(item),
            hideDescription: this.shouldHideDescription(item),
            hideElapsed: this.shouldHideElapsed(item)
        };
        const parts = limited.map(agent => formatAgent(agent, flags, rawValue, now));
        const separator = mode === 'active' ? ', ' : ' | ';
        const joined = parts.join(separator);

        return rawValue ? joined : `Agents: ${joined}`;
    }

    private renderPreview(mode: Mode, rawValue: boolean): string {
        if (mode === 'active') {
            return rawValue
                ? 'explore [haiku]: Finding auth code (12s)'
                : 'Agents: ◐ explore [haiku]: Finding auth code (12s)';
        }
        if (mode === 'last') {
            return rawValue
                ? 'code-reviewer [opus]: Review complete (2m 34s)'
                : 'Agents: ✓ code-reviewer [opus]: Review complete (2m 34s)';
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
        return raw !== undefined && (MODES as string[]).includes(raw) ? raw as Mode : 'mixed';
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