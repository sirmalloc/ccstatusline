import type { RenderContext } from '../../types/RenderContext';
import type { WidgetItem } from '../../types/Widget';

const HIDE_FOR_MODELS_KEY = 'hideForModels';
const SHOW_FOR_MODELS_KEY = 'showForModels';

// Model identifiers to match against: the payload's model is either a plain
// string or { id, display_name }.
function getModelCandidates(context: RenderContext): string[] {
    const model = context.data?.model;
    if (!model) {
        return [];
    }
    if (typeof model === 'string') {
        return [model];
    }
    return [model.id, model.display_name].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

// Glob match: '*' is any run of characters; comparison is case-insensitive.
function matchesAnyPattern(value: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
        const source = pattern
            .split('*')
            .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*');
        return new RegExp(`^${source}$`, 'i').test(value);
    });
}

function parsePatterns(item: WidgetItem, key: string): string[] {
    const raw = item.metadata?.[key];
    if (!raw) {
        return [];
    }
    return raw.split(',').map(pattern => pattern.trim()).filter(pattern => pattern.length > 0);
}

// True when the widget's model condition says it must not render. A context
// without model info (TUI preview, minimal payload) always renders.
export function isWidgetHiddenByModel(item: WidgetItem, context: RenderContext): boolean {
    const candidates = getModelCandidates(context);
    if (candidates.length === 0) {
        return false;
    }

    const hidePatterns = parsePatterns(item, HIDE_FOR_MODELS_KEY);
    if (hidePatterns.length > 0 && candidates.some(value => matchesAnyPattern(value, hidePatterns))) {
        return true;
    }

    const showPatterns = parsePatterns(item, SHOW_FOR_MODELS_KEY);
    if (showPatterns.length > 0 && !candidates.some(value => matchesAnyPattern(value, showPatterns))) {
        return true;
    }

    return false;
}
