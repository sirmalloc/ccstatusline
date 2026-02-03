import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getSkillsMetrics } from '../utils/skills';

type SkillsDisplayMode = 'current' | 'count' | 'list';

const DISPLAY_MODES: SkillsDisplayMode[] = ['current', 'count', 'list'];

export class SkillsWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows Claude Code skill invocations from hook data'; }
    getDisplayName(): string { return 'Skills'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const mode = this.getDisplayMode(item);
        const modeLabels: Record<SkillsDisplayMode, string> = {
            current: 'last used',
            count: 'total count',
            list: 'unique list'
        };

        return {
            displayText: this.getDisplayName(),
            modifierText: `(${modeLabels[mode]})`
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'cycle-mode') {
            const currentMode = this.getDisplayMode(item);
            const currentIndex = DISPLAY_MODES.indexOf(currentMode);
            const nextIndex = (currentIndex + 1) % DISPLAY_MODES.length;
            const nextMode = DISPLAY_MODES[nextIndex] ?? 'current';

            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    mode: nextMode
                }
            };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const mode = this.getDisplayMode(item);

        if (context.isPreview) {
            return this.renderPreview(item, mode);
        }

        // Get session ID from context
        const sessionId = context.data?.session_id;
        if (!sessionId) {
            return null;
        }

        // Get skills metrics for this session
        const metrics = getSkillsMetrics(sessionId);

        if (metrics.totalInvocations === 0) {
            return null;
        }

        return this.formatOutput(item, mode, metrics.lastSkill, metrics.totalInvocations, metrics.uniqueSkills);
    }

    private renderPreview(item: WidgetItem, mode: SkillsDisplayMode): string {
        switch (mode) {
            case 'current':
                return item.rawValue ? 'commit' : 'Skill: commit';
            case 'count':
                return item.rawValue ? '5' : 'Skills: 5';
            case 'list':
                return item.rawValue ? 'commit, review-pr' : 'Skills: commit, review-pr';
        }
    }

    private formatOutput(
        item: WidgetItem,
        mode: SkillsDisplayMode,
        lastSkill: string | null,
        totalCount: number,
        uniqueSkills: string[]
    ): string | null {
        switch (mode) {
            case 'current':
                if (!lastSkill) return null;
                return item.rawValue ? lastSkill : `Skill: ${lastSkill}`;
            case 'count':
                return item.rawValue ? String(totalCount) : `Skills: ${totalCount}`;
            case 'list':
                if (uniqueSkills.length === 0) return null;
                const skillList = uniqueSkills.join(', ');
                return item.rawValue ? skillList : `Skills: ${skillList}`;
        }
    }

    private getDisplayMode(item: WidgetItem): SkillsDisplayMode {
        const mode = item.metadata?.mode;
        if (mode && DISPLAY_MODES.includes(mode as SkillsDisplayMode)) {
            return mode as SkillsDisplayMode;
        }
        return 'current';
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'm', label: '(m)ode: current/count/list', action: 'cycle-mode' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
