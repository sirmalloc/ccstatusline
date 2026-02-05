import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type { CustomKeybind, Widget, WidgetEditorDisplay, WidgetItem } from '../types/Widget';

type Mode = 'current' | 'count' | 'list';
const MODES: Mode[] = ['current', 'count', 'list'];
const MODE_LABELS: Record<Mode, string> = { current: 'last used', count: 'total count', list: 'unique list' };

export class SkillsWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows Claude Code skill invocations from hook data'; }
    getDisplayName(): string { return 'Skills'; }
    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }

    getCustomKeybinds(): CustomKeybind[] {
        return [{ key: 'm', label: '(m)ode: current/count/list', action: 'cycle-mode' }];
    }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: 'Skills', modifierText: `(${MODE_LABELS[this.getMode(item)]})` };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action !== 'cycle-mode') return null;
        const nextMode = MODES[(MODES.indexOf(this.getMode(item)) + 1) % MODES.length] ?? 'current';
        return { ...item, metadata: { ...item.metadata, mode: nextMode } };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const mode = this.getMode(item);
        const raw = item.rawValue;

        if (context.isPreview) {
            if (mode === 'current') return raw ? 'commit' : 'Skill: commit';
            if (mode === 'count') return raw ? '5' : 'Skills: 5';
            return raw ? 'commit, review-pr' : 'Skills: commit, review-pr';
        }

        const m = context.skillsMetrics;
        if (!m || m.totalInvocations === 0) return null;

        if (mode === 'current') return m.lastSkill ? (raw ? m.lastSkill : `Skill: ${m.lastSkill}`) : null;
        if (mode === 'count') return raw ? String(m.totalInvocations) : `Skills: ${m.totalInvocations}`;
        if (m.uniqueSkills.length === 0) return null;
        const list = m.uniqueSkills.join(', ');
        return raw ? list : `Skills: ${list}`;
    }

    private getMode(item: WidgetItem): Mode {
        const mode = item.metadata?.mode;
        return mode && MODES.includes(mode as Mode) ? mode as Mode : 'current';
    }
}
