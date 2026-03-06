import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

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

type Mode = 'current' | 'count' | 'list';
const MODES: Mode[] = ['current', 'count', 'list'];
const MODE_LABELS: Record<Mode, string> = { current: 'last used', count: 'total count', list: 'unique list' };
const HIDE_WHEN_EMPTY_KEY = 'hideWhenEmpty';
const LIST_LIMIT_KEY = 'listLimit';
const TOGGLE_HIDE_EMPTY_ACTION = 'toggle-hide-empty';
const EDIT_LIST_LIMIT_ACTION = 'edit-list-limit';

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

export class SkillsWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows Claude Code skill invocations from hook data'; }
    getDisplayName(): string { return 'Skills'; }
    getCategory(): string { return 'Session'; }
    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }

    getHooks(): WidgetHookDef[] {
        return [
            { event: 'PreToolUse', matcher: 'Skill' },
            { event: 'UserPromptSubmit' }
        ];
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'v', label: '(v)iew: last/count/list', action: 'cycle-mode' },
            { key: 'h', label: '(h)ide when empty', action: TOGGLE_HIDE_EMPTY_ACTION },
            { key: 'l', label: '(l)imit', action: EDIT_LIST_LIMIT_ACTION }
        ];
    }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers = [MODE_LABELS[this.getMode(item)]];
        if (this.getMode(item) === 'list') {
            const limit = parseListLimit(item);
            if (limit > 0) {
                modifiers.push(`limit: ${limit}`);
            }
        }
        if (this.isHideWhenEmptyEnabled(item)) {
            modifiers.push('hide when empty');
        }
        return { displayText: 'Skills', modifierText: makeModifierText(modifiers) };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'cycle-mode') {
            const next = MODES[(MODES.indexOf(this.getMode(item)) + 1) % MODES.length] ?? 'current';
            return { ...item, metadata: { ...item.metadata, mode: next } };
        }
        if (action === TOGGLE_HIDE_EMPTY_ACTION) {
            return toggleMetadataFlag(item, HIDE_WHEN_EMPTY_KEY);
        }
        return null;
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <SkillsEditor {...props} />;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const mode = this.getMode(item);
        const raw = item.rawValue;
        const hideWhenEmpty = this.isHideWhenEmptyEnabled(item);

        if (context.isPreview) {
            if (mode === 'current') {
                return raw ? 'commit' : 'Skill: commit';
            }
            if (mode === 'count') {
                return raw ? '5' : 'Skills: 5';
            }
            return raw ? 'commit, review-pr' : 'Skills: commit, review-pr';
        }

        if (mode === 'current') {
            const currentSkill = context.skillsMetrics?.lastSkill;
            if (!currentSkill) {
                if (hideWhenEmpty) {
                    return null;
                }
                return raw ? 'none' : 'Skill: none';
            }
            return raw ? currentSkill : `Skill: ${currentSkill}`;
        }
        if (mode === 'count') {
            const total = context.skillsMetrics?.totalInvocations ?? 0;
            if (hideWhenEmpty && total === 0) {
                return null;
            }
            return raw ? String(total) : `Skills: ${total}`;
        }

        const uniqueSkills = context.skillsMetrics?.uniqueSkills ?? [];
        if (uniqueSkills.length === 0) {
            if (hideWhenEmpty) {
                return null;
            }
            return raw ? 'none' : 'Skills: none';
        }

        const limit = parseListLimit(item);
        const visibleSkills = limit > 0 ? uniqueSkills.slice(0, limit) : uniqueSkills;
        const list = visibleSkills.join(', ');
        return raw ? list : `Skills: ${list}`;
    }

    private getMode(item: WidgetItem): Mode {
        const mode = item.metadata?.mode;
        return mode && MODES.includes(mode as Mode) ? mode as Mode : 'current';
    }

    private isHideWhenEmptyEnabled(item: WidgetItem): boolean {
        return isMetadataFlagEnabled(item, HIDE_WHEN_EMPTY_KEY);
    }
}

const SkillsEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel, action }) => {
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
                    <Text>Enter max skills to show (0 for unlimited): </Text>
                    <Text>{limitInput}</Text>
                    <Text backgroundColor='gray' color='black'>{' '}</Text>
                </Box>
                <Text dimColor>Press Enter to save, ESC to cancel</Text>
            </Box>
        );
    }

    return <Text>Unknown editor mode</Text>;
};