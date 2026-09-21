import * as fs from 'fs';
import * as path from 'path';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getConfigPath } from '../utils/config';

function getCostsDir(): string {
    return path.join(path.dirname(getConfigPath()), 'costs');
}

function sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

function persistCost(costsDir: string, sessionId: string, cost: number): void {
    try {
        fs.mkdirSync(costsDir, { recursive: true });
        fs.writeFileSync(path.join(costsDir, sanitizeId(sessionId)), String(cost), 'utf-8');
    } catch {
        // Ignore write errors silently
    }
}

function sumCosts(costsDir: string): number {
    try {
        return fs.readdirSync(costsDir).reduce((sum, file) => {
            try {
                const value = parseFloat(fs.readFileSync(path.join(costsDir, file), 'utf-8').trim());
                return sum + (Number.isFinite(value) ? value : 0);
            } catch {
                return sum;
            }
        }, 0);
    } catch {
        return 0;
    }
}

export class TotalCostWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows cumulative total cost across all Claude Code sessions'; }
    getDisplayName(): string { return 'Total Cost'; }
    getCategory(): string { return 'Session'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '$12.34' : 'Total: $12.34';
        }

        const cost = context.data?.cost?.total_cost_usd;
        const sessionId = context.data?.session_id;
        const costsDir = getCostsDir();

        if (sessionId && cost !== undefined && cost > 0) {
            persistCost(costsDir, sessionId, cost);
        }

        const total = sumCosts(costsDir);
        if (total === 0) return null;

        const formatted = `$${total.toFixed(2)}`;
        return item.rawValue ? formatted : `Total: ${formatted}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
