import { getColorLevelString } from '../types/ColorLevel';
import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import type {
    ClaudeIncidentImpact,
    ClaudeStatusColorKey
} from '../utils/claude-service-status';
import {
    computeIncidentHistoryBuckets,
    getClaudeStatusFgCode,
    isClaudeStatusHistoryEnabled
} from '../utils/claude-service-status';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const LABEL = 'Claude: ';
const HISTORY_BAR_CHAR = '▮';

const INDICATOR_TEXT: Record<string, string> = {
    none: 'ok',
    minor: 'minor',
    major: 'major',
    critical: 'critical',
    maintenance: 'maintenance'
};

function getIndicatorColorKey(indicator: string): ClaudeStatusColorKey {
    switch (indicator) {
        case 'none':
            return 'none';
        case 'minor':
            return 'minor';
        case 'major':
            return 'major';
        case 'critical':
            return 'critical';
        case 'maintenance':
            return 'maintenance';
        default:
            return 'unknown';
    }
}

export class ClaudeStatusWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows Claude service status from status.claude.com with an optional 48h incident history strip'; }
    getDisplayName(): string { return 'Claude Status'; }
    getCategory(): string { return 'Core'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: isClaudeStatusHistoryEnabled(item) ? '(history)' : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-history') {
            return {
                ...item,
                metadata: {
                    ...(item.metadata ?? {}),
                    history: isClaudeStatusHistoryEnabled(item) ? 'false' : 'true'
                }
            };
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const showHistory = isClaudeStatusHistoryEnabled(item);
        const colorLevel = getColorLevelString(settings.colorLevel);
        const colorize = (text: string, key: ClaudeStatusColorKey): string => {
            // Level 0 means colors are disabled entirely; emit plain text so the
            // preserve-colors render path cannot smuggle codes past the setting.
            if (settings.colorLevel === 0) {
                return text;
            }
            const code = getClaudeStatusFgCode(key, colorLevel);
            // Restore only the default foreground so powerline backgrounds survive.
            return code ? `${code}${text}\x1b[39m` : text;
        };

        if (context.isPreview) {
            if (!showHistory) {
                return formatRawOrLabeledValue(item, LABEL, 'ok');
            }
            const previewBuckets: ClaudeIncidentImpact[] = ['none', 'none', 'minor', 'none', 'major', 'none', 'critical', 'none'];
            const previewBar = previewBuckets.map(bucket => colorize(HISTORY_BAR_CHAR, bucket)).join('');
            const previewStatus = colorize(formatRawOrLabeledValue(item, LABEL, 'ok'), 'none');
            return `${previewStatus} ${previewBar}`;
        }

        const data = context.claudeStatusData;
        if (!data || data.error || data.indicator === undefined) {
            // Degrade quietly on fetch/parse failures instead of breaking the line.
            if (showHistory) {
                return colorize(formatRawOrLabeledValue(item, LABEL, '?'), 'unknown');
            }
            return formatRawOrLabeledValue(item, LABEL, '?');
        }

        const statusText = INDICATOR_TEXT[data.indicator] ?? data.indicator;
        if (!showHistory) {
            return formatRawOrLabeledValue(item, LABEL, statusText);
        }

        // Color the label together with the status. The renderer deliberately
        // skips its theme foreground while preserving the multi-colored strip,
        // so leaving the label uncolored could make it unreadable in Powerline.
        const coloredStatus = colorize(
            formatRawOrLabeledValue(item, LABEL, statusText),
            getIndicatorColorKey(data.indicator)
        );
        const buckets = computeIncidentHistoryBuckets(data.incidents ?? [], Date.now());
        const bar = buckets.map(bucket => colorize(HISTORY_BAR_CHAR, bucket)).join('');
        return `${coloredStatus} ${bar}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)istory toggle', action: 'toggle-history' }
        ];
    }

    // The history strip embeds its own per-bucket foreground codes, so the
    // renderer must treat this widget like a preserve-colors custom command.
    preservesRenderedColors(item: WidgetItem): boolean {
        return isClaudeStatusHistoryEnabled(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return !isClaudeStatusHistoryEnabled(item); }
}
