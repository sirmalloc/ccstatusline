import chalk from 'chalk';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

const DEFAULT_WARNING_THRESHOLD = 80;
const DEFAULT_CRITICAL_THRESHOLD = 95;
const DEFAULT_FORMAT = 'spend-percent';
const VALID_FORMATS = new Set(['spend-percent', 'percent', 'spend']);

function readThreshold(item: WidgetItem, key: string, fallback: number): number {
    const raw = item.metadata?.[key];
    if (!raw)
        return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0 || n > 100)
        return fallback;
    return n;
}

function readFormat(item: WidgetItem): string {
    const raw = item.metadata?.format;
    if (raw && VALID_FORMATS.has(raw))
        return raw;
    return DEFAULT_FORMAT;
}

function formatValue(spend: number, budget: number, percentage: number, format: string): string {
    const spendStr = `$${spend.toFixed(2)}`;
    const pctStr = `${percentage.toFixed(0)}%`;
    const budgetStr = `$${budget.toFixed(2)}`;
    if (format === 'percent')
        return pctStr;
    if (format === 'spend')
        return spendStr;
    return `${spendStr}/${budgetStr} (${pctStr})`;
}

function applyTier(text: string, percentage: number, warning: number, critical: number): string {
    if (percentage >= critical)
        return chalk.red(text);
    if (percentage >= warning)
        return chalk.yellow(text);
    return chalk.green(text);
}

function endpointHostHint(item: WidgetItem): string | undefined {
    const preset = item.metadata?.preset;
    const endpoint = item.metadata?.endpoint;
    if (endpoint) {
        try {
            return new URL(endpoint.replace('${baseUrl}', 'https://example.com')).hostname;
        } catch {
            return undefined;
        }
    }
    if (preset)
        return preset;
    return undefined;
}

export class ProxyBudgetWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Spend vs budget from a LiteLLM / OpenRouter / compatible proxy endpoint'; }
    getDisplayName(): string { return 'Proxy Budget'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const hint = endpointHostHint(item);
        return {
            displayText: this.getDisplayName(),
            modifierText: hint ? `(${hint})` : undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            const previewText = formatValue(12.34, 100, 45, readFormat(item));
            const labeled = item.rawValue ? previewText : `Budget: ${previewText}`;
            return chalk.green(labeled);
        }

        const data = context.proxyBudgetData;
        if (!data) {
            return null;
        }

        const warning = readThreshold(item, 'warningThreshold', DEFAULT_WARNING_THRESHOLD);
        const critical = readThreshold(item, 'criticalThreshold', DEFAULT_CRITICAL_THRESHOLD);
        const format = readFormat(item);
        const value = formatValue(data.spend, data.budget, data.percentage, format);
        const labeled = item.rawValue ? value : `Budget: ${value}`;
        return applyTier(labeled, data.percentage, warning, critical);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }

    getNumericValue(context: RenderContext, _item: WidgetItem): number | null {
        return context.proxyBudgetData?.percentage ?? null;
    }
}
