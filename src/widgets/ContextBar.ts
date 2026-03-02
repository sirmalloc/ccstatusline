import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { makeUsageProgressBar } from '../utils/usage';

export class ContextBarWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows context usage as a progress bar'; }
    getDisplayName(): string { return 'Context Bar'; }
    getCategory(): string { return 'Context'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview)
            return 'Context: [████░░░░░░░░░░░] 50k/200k (25%)';

        const cw = context.data?.context_window;
        if (!cw)
            return null;

        const total = Number(cw.context_window_size) || 200000;

        // current_usage can be a number or an object with token breakdown
        let used = 0;
        if (typeof cw.current_usage === 'number') {
            used = cw.current_usage;
        } else if (cw.current_usage && typeof cw.current_usage === 'object') {
            const u = cw.current_usage;
            used = (Number(u.input_tokens) || 0)
                + (Number(u.output_tokens) || 0)
                + (Number(u.cache_creation_input_tokens) || 0)
                + (Number(u.cache_read_input_tokens) || 0);
        }

        if (isNaN(total) || isNaN(used))
            return null;

        const percent = total > 0 ? (used / total) * 100 : 0;

        const usedK = Math.round(used / 1000);
        const totalK = Math.round(total / 1000);

        return `Context: ${makeUsageProgressBar(percent)} ${usedK}k/${totalK}k (${Math.round(percent)}%)`;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}